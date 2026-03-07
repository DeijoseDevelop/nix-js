// ═══════════════════════════════════════════════
//  Nix.js ❄️ — Template Engine  (Fase 2)
// ═══════════════════════════════════════════════
//
//  html`<p>Hola ${() => name.value}</p>`
//  → NixTemplate { mount(el), _render(parent, before) }
//
//  Tipos de binding:
//    1. texto estático   →  string / number directo
//    2. texto reactivo   →  () => primitivo
//    3. evento           →  @event=${handler}
//    4. atributo         →  attr=${fn | valor}
//    5. template anidado →  html`` directo
//    6. condicional      →  () => html`` | null
//    7. lista            →  () => html``[]

import { effect } from "./reactivity";
import { isNixComponent } from "./lifecycle";
import type { NixComponent } from "./lifecycle";
import {
    _captureContextSnapshot,
    _pushComponentContext,
    _popComponentContext,
    _withComponentContext,
} from "./context";

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface NixTemplate {
    readonly __isNixTemplate: true;
    /** Monta el template en un contenedor (uso externo / raíz). */
    mount(container: Element | string): NixMountHandle;
    /**
     * @internal — Renderiza el template antes del nodo `before` (o al final
     * de `parent` si `before` es null).  Retorna una función de limpieza.
     */
    _render(parent: Node, before: Node | null): () => void;
}

export interface NixMountHandle {
    unmount(): void;
}

/**
 * Contenedor para una referencia directa a un elemento DOM.
 * Se asigna automáticamente cuando el template se monta y se limpia al
 * desmontarse.
 *
 * @example
 * const inputRef = ref<HTMLInputElement>();
 * html`<input ref=${inputRef} />`
 * // después del mount:
 * inputRef.el?.focus();
 */
export interface NixRef<T extends Element = Element> {
    el: T | null;
}

/**
 * Crea un objeto `NixRef` vacío.
 * Pásalo como valor del atributo especial `ref` en un template para que
 * Nix.js rellene automáticamente `ref.el` con el elemento real del DOM.
 */
export function ref<T extends Element = Element>(): NixRef<T> {
    return { el: null };
}

/**
 * Resultado de `repeat()` — lista con keys para diffing eficiente.
 * El template engine lo reconoce y solo añade/mueve/elimina los nodos
 * que realmente cambiaron, preservando el DOM de los items estables.
 */
export interface KeyedList<T = unknown> {
    readonly __isKeyedList: true;
    readonly items: T[];
    readonly keyFn: (item: T, index: number) => string | number;
    readonly renderFn: (item: T, index: number) => NixTemplate | NixComponent;
}

/**
 * Crea una lista con keys para diffing eficiente.
 * Úsalo en lugar de `.map()` cuando la lista cambia frecuentemente.
 *
 * @param items    Array reactivo de datos
 * @param keyFn    Devuelve una clave única por item (p.ej. `item => item.id`)
 * @param renderFn Devuelve el template/componente para cada item
 *
 * @example
 * ${() => repeat(
 *   users.value,
 *   u => u.id,
 *   u => html`<li>${u.name}</li>`
 * )}
 */
export function repeat<T>(
    items: T[],
    keyFn: (item: T, index: number) => string | number,
    renderFn: (item: T, index: number) => NixTemplate | NixComponent
): KeyedList<T> {
    return { __isKeyedList: true as const, items, keyFn, renderFn };
}

// ─── Contexto de binding ──────────────────────────────────────────────────────

type BindingContext =
    | { type: "node" }
    | { type: "event"; eventName: string; modifiers: string[]; hadOpenQuote: boolean }
    | { type: "attr"; attrName: string; hadOpenQuote: boolean };

/**
 * Examina el string que PRECEDE a un valor interpolado y determina
 * el contexto en que aparece: nodo, evento o atributo.
 *
 *   "<p>"            → node
 *   "<button @click="  → event  (hadOpenQuote = true)
 *   "<div class="    → attr   (hadOpenQuote = true)
 *   "<div class=     → attr   (hadOpenQuote = false)
 *
 * ⚠️  LIMITACIÓN — Interpolación parcial de atributos NO soportada:
 *
 *   ✅  html`<div class="${cls}">` ← el valor completo es una interpolación
 *   ❌  html`<div class="prefix-${cls}">` ← literal + interpolación mezclados
 *
 *   En el segundo caso, detectContext ve el string previo terminando en
 *   `class="prefix-` y no puede identificar que la interpolación es PARTE
 *   del valor — la regex del atributo no matchea por el literal intermedio.
 *   Solución: calcular siempre el string completo fuera del template:
 *
 *     const cls = `prefix-${dynamic}`;
 *     html`<div class="${cls}">`
 */
function detectContext(prevString: string): BindingContext {
    const lastClose = prevString.lastIndexOf(">");
    const lastOpen = prevString.lastIndexOf("<");

    if (lastOpen <= lastClose) {
        // Estamos entre tags → contexto de nodo
        return { type: "node" };
    }

    // Estamos dentro de la definición de un tag
    const tagContent = prevString.slice(lastOpen + 1);

    // Evento: @eventname[.modifier...]=  / @eventname[.modifier...]="  / '
    const eventMatch = tagContent.match(/@([\w:.-]+)=["']?$/);
    if (eventMatch) {
        const full = eventMatch[1];          // e.g. "click.prevent.stop"
        const parts = full.split(".");
        const eventName = parts[0];
        const modifiers = parts.slice(1);
        return {
            type: "event",
            eventName,
            modifiers,
            hadOpenQuote:
                eventMatch[0].endsWith('"') || eventMatch[0].endsWith("'"),
        };
    }

    // Atributo: attrname=  / attrname="  / attrname='
    const attrMatch = tagContent.match(/([\w:.-]+)=["']?$/);
    if (attrMatch) {
        return {
            type: "attr",
            attrName: attrMatch[1],
            hadOpenQuote:
                attrMatch[0].endsWith('"') || attrMatch[0].endsWith("'"),
        };
    }

    return { type: "node" };
}

// ─── Construcción del HTML con marcadores ─────────────────────────────────────

/**
 * Construye el string HTML estático reemplazando cada valor interpolado con:
 *  - nodo:   <!--nix-N-->
 *  - evento: atributo data-nix-e-N="eventname"
 *  - attr:   atributo data-nix-a-N="attrname"
 *
 * Para eventos/attrs, también elimina las comillas de apertura del string
 * anterior y marca el string siguiente para omitir la comilla de cierre.
 */
function buildHTML(
    strings: readonly string[],
    contexts: BindingContext[]
): string {
    const skipLeading = new Array(strings.length).fill(0);
    let result = "";

    for (let i = 0; i < strings.length; i++) {
        let s = strings[i];

        // Omitir la comilla de cierre que dejó el binding anterior
        if (skipLeading[i] === 1 && (s[0] === '"' || s[0] === "'")) {
            s = s.slice(1);
        }

        if (i < contexts.length) {
            const ctx = contexts[i];

            if (ctx.type === "node") {
                result += s + `<!--nix-${i}-->`;
            } else if (ctx.type === "event") {
                // data-nix-e-N almacena solo el nombre base del evento
                const full = ctx.modifiers.length
                    ? `${ctx.eventName}.${ctx.modifiers.join(".")}`
                    : ctx.eventName;
                const cut = `@${full}=`.length + (ctx.hadOpenQuote ? 1 : 0);
                result += s.slice(0, -cut) + ` data-nix-e-${i}="${ctx.eventName}"`;
                if (ctx.hadOpenQuote) skipLeading[i + 1] = 1;
            } else {
                // attr
                const cut =
                    `${ctx.attrName}=`.length + (ctx.hadOpenQuote ? 1 : 0);
                result += s.slice(0, -cut) + ` data-nix-a-${i}="${ctx.attrName}"`;
                if (ctx.hadOpenQuote) skipLeading[i + 1] = 1;
            }
        } else {
            result += s;
        }
    }

    return result;
}

// ─── Helpers de inspección del DOM ───────────────────────────────────────────

function isNixTemplate(v: unknown): v is NixTemplate {
    return (
        v != null &&
        typeof v === "object" &&
        (v as Record<string, unknown>).__isNixTemplate === true
    );
}

function isKeyedList(v: unknown): v is KeyedList {
    return (
        v != null &&
        typeof v === "object" &&
        (v as Record<string, unknown>).__isKeyedList === true
    );
}

/** Recorre el subárbol y devuelve un mapa de índice → Comment marcador. */
function findCommentMarkers(root: Node): Map<number, Comment> {
    const map = new Map<number, Comment>();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
        const c = node as Comment;
        const m = c.nodeValue?.match(/^nix-(\d+)$/);
        if (m) map.set(parseInt(m[1]), c);
    }
    return map;
}

/** Recorre el subárbol buscando atributos data-nix-e-N / data-nix-a-N. */
function findAttrEventMarkers(
    fragment: DocumentFragment
): Map<number, { el: Element; type: "attr" | "event"; name: string }> {
    const map = new Map<
        number,
        { el: Element; type: "attr" | "event"; name: string }
    >();

    const check = (el: Element) => {
        const attrs = Array.from(el.attributes); // snapshot antes de mutar
        for (const attr of attrs) {
            let m = attr.name.match(/^data-nix-e-(\d+)$/);
            if (m) {
                map.set(parseInt(m[1]), { el, type: "event", name: attr.value });
                el.removeAttribute(attr.name);
                continue;
            }
            m = attr.name.match(/^data-nix-a-(\d+)$/);
            if (m) {
                map.set(parseInt(m[1]), { el, type: "attr", name: attr.value });
                el.removeAttribute(attr.name);
            }
        }
    };

    fragment.querySelectorAll("*").forEach(check);
    return map;
}

// ─── Activación de bindings ───────────────────────────────────────────────────

/**
 * Activa todos los bindings del fragmento clonado.
 * Devuelve un array de funciones dispose para limpiar al desmontar.
 */
function activateBindings(
    fragment: DocumentFragment,
    contexts: BindingContext[],
    values: unknown[]
): { disposes: Array<() => void>; postMountHooks: Array<() => void> } {
    const disposes: Array<() => void> = [];
    const postMountHooks: Array<() => void> = [];

    const commentMap = findCommentMarkers(fragment);
    const attrEventMap = findAttrEventMarkers(fragment);

    for (let i = 0; i < contexts.length; i++) {
        const ctx = contexts[i];
        const value = values[i];

        // ── EVENTOS ──────────────────────────────────────────────
        if (ctx.type === "event") {
            const info = attrEventMap.get(i);
            if (!info) continue;
            const { el, name: eventName } = info;
            const rawHandler = value as EventListener;
            const mods = ctx.modifiers;

            // Opciones para addEventListener
            const listenerOpts: AddEventListenerOptions = {};
            if (mods.includes("once")) listenerOpts.once = true;
            if (mods.includes("capture")) listenerOpts.capture = true;
            if (mods.includes("passive")) listenerOpts.passive = true;

            // Mapa de teclas con nombre
            const KEY_MAP: Record<string, string> = {
                enter: "Enter",
                escape: "Escape",
                space: " ",
                tab: "Tab",
                delete: "Delete",
                backspace: "Backspace",
                up: "ArrowUp",
                down: "ArrowDown",
                left: "ArrowLeft",
                right: "ArrowRight",
            };

            const handler: EventListener = (e: Event) => {
                if (mods.includes("prevent")) e.preventDefault();
                if (mods.includes("stop")) e.stopPropagation();
                if (mods.includes("self") && e.target !== e.currentTarget) return;

                // Filtros de tecla (solo aplican cuando el evento tiene `key`)
                if ("key" in e) {
                    const ke = e as KeyboardEvent;
                    for (const mod of mods) {
                        const mapped = KEY_MAP[mod];
                        if (mapped !== undefined && ke.key !== mapped) return;
                        // tecla individual (una letra/dígito)
                        if (!KEY_MAP[mod] && mod.length === 1 && ke.key.toLowerCase() !== mod) return;
                    }
                }

                rawHandler(e);
            };

            el.addEventListener(eventName, handler, listenerOpts);
            disposes.push(() => el.removeEventListener(eventName, handler, listenerOpts));
            continue;
        }

        // ── ATRIBUTOS ─────────────────────────────────────────────
        if (ctx.type === "attr") {
            const info = attrEventMap.get(i);
            if (!info) continue;
            const { el, name: attrName } = info;

            // ── REF especial ──────────────────────────────────────────────
            if (attrName === "ref") {
                (value as NixRef<Element>).el = el as Element;
                disposes.push(() => { (value as NixRef<Element>).el = null; });
                continue;
            }

            if (typeof value === "function") {
                const dispose = effect(() => {
                    const v = (value as () => unknown)();
                    if (v == null || v === false) {
                        el.removeAttribute(attrName);
                    } else {
                        el.setAttribute(attrName, String(v));
                    }
                });
                disposes.push(dispose);
            } else {
                // Valor estático
                if (value != null && value !== false) {
                    el.setAttribute(attrName, String(value));
                }
            }
            continue;
        }

        // ── NODO ──────────────────────────────────────────────────
        const anchor = commentMap.get(i);
        if (!anchor) continue;

        // Valor completamente estático (string/number/NixTemplate/NixComponent directo)
        if (typeof value !== "function") {
            if (isNixComponent(value)) {
                // Componente clase estático: render + programar onMount tras inserción en DOM
                const inst = value;
                _pushComponentContext();
                let innerCleanup!: () => void;
                try {
                    try { inst.onInit?.(); } catch (e) { if (inst.onError) inst.onError(e); else throw e; }
                    innerCleanup = inst.render()._render(anchor.parentNode!, anchor);
                } finally {
                    _popComponentContext();
                }
                let mountCleanup: (() => void) | undefined;
                postMountHooks.push(() => {
                    try {
                        const ret = inst.onMount?.();
                        if (typeof ret === "function") mountCleanup = ret;
                    } catch (e) {
                        if (inst.onError) inst.onError(e);
                        else throw e;
                    }
                });
                disposes.push(() => {
                    try { inst.onUnmount?.(); } catch { /* ignore */ }
                    try { mountCleanup?.(); } catch { /* ignore */ }
                    innerCleanup();
                });
            } else if (isNixTemplate(value)) {
                // Template anidado estático: insertar directamente
                value._render(anchor.parentNode!, anchor);
            } else if (Array.isArray(value)) {
                for (const item of value) {
                    if (isNixComponent(item)) {
                        let innerCleanupItem!: () => void;
                        _pushComponentContext();
                        try {
                            try { item.onInit?.(); } catch (e) { if (item.onError) item.onError(e); else throw e; }
                            innerCleanupItem = item.render()._render(anchor.parentNode!, anchor);
                        } finally {
                            _popComponentContext();
                        }
                        let mountCleanupItem: (() => void) | undefined;
                        postMountHooks.push(() => {
                            try {
                                const ret = item.onMount?.();
                                if (typeof ret === "function") mountCleanupItem = ret;
                            } catch (e) {
                                if (item.onError) item.onError(e);
                                else throw e;
                            }
                        });
                        disposes.push(() => {
                            try { item.onUnmount?.(); } catch { /* ignore */ }
                            try { mountCleanupItem?.(); } catch { /* ignore */ }
                            innerCleanupItem();
                        });
                    } else if (isNixTemplate(item)) {
                        item._render(anchor.parentNode!, anchor);
                    } else if (item != null && item !== false) {
                        anchor.parentNode!.insertBefore(
                            document.createTextNode(String(item)),
                            anchor
                        );
                    }
                }
            } else if (value != null && value !== false) {
                anchor.parentNode!.insertBefore(
                    document.createTextNode(String(value)),
                    anchor
                );
            }
            continue;
        }

        // Valor dinámico (función)
        // Usamos el anchor como "end marker". El contenido se inserta antes de él.
        // Para texto reactivo simple, reutilizamos un TextNode.
        let textNode: Text | null = null;
        // Para templates/condicionales/listas guardamos el cleanup del contenido anterior
        let innerCleanup: (() => void) | null = null;

        // ── Estado para repeat() keyed diffing ──────────────────────────────
        type Key = string | number;
        interface KEntry {
            start: Comment;
            end: Comment;
            cleanup: () => void;
        }
        let keyedState: Map<Key, KEntry> | null = null;

        // Capturar el contexto provide/inject vigente en este punto del árbol,
        // para que los componentes dinámicos (reactivos) vean los valores
        // provistos por sus ancestros incluso al re-renderizar.
        const ctxSnapshot = _captureContextSnapshot();

        const dispose = effect(() => {
            const v = (value as () => unknown)();

            // ── Texto reactivo simple ──
            if (typeof v === "string" || typeof v === "number") {
                // Limpiamos cualquier template previo si hubiera
                if (innerCleanup) {
                    innerCleanup();
                    innerCleanup = null;
                }
                if (!textNode) {
                    textNode = document.createTextNode(String(v));
                    anchor.parentNode!.insertBefore(textNode, anchor);
                } else {
                    textNode.nodeValue = String(v);
                }
                return;
            }

            // Para otros tipos, siempre reconstruimos
            if (textNode) {
                textNode.parentNode?.removeChild(textNode);
                textNode = null;
            }
            if (innerCleanup) {
                innerCleanup();
                innerCleanup = null;
            }

            if (v == null || v === false) {
                // Nada que renderizar
            } else if (isNixTemplate(v)) {
                // Condicional: template activo
                innerCleanup = v._render(anchor.parentNode!, anchor);
            } else if (isNixComponent(v)) {
                // NixComponent dinámico (condicional de clase)
                const inst = v;
                let templateCleanup!: () => void;
                _withComponentContext(ctxSnapshot, () => {
                    try { inst.onInit?.(); } catch (e) { if (inst.onError) inst.onError(e); else throw e; }
                    templateCleanup = inst.render()._render(anchor.parentNode!, anchor);
                });
                let mountCleanup: (() => void) | undefined;
                try {
                    const ret = inst.onMount?.();
                    if (typeof ret === "function") mountCleanup = ret;
                } catch (e) {
                    if (inst.onError) inst.onError(e);
                    else throw e;
                }
                innerCleanup = () => {
                    try { inst.onUnmount?.(); } catch { /* ignore */ }
                    try { mountCleanup?.(); } catch { /* ignore */ }
                    templateCleanup();
                };
            } else if (isKeyedList(v)) {
                // ── Keyed list (repeat()) ── diffing eficiente con keys ──────
                if (!keyedState) keyedState = new Map();
                const parent = anchor.parentNode!;
                const newKeyOrder: Key[] = v.items.map(
                    (item, i) => v.keyFn(item as never, i)
                );
                const newKeySet = new Set(newKeyOrder);

                // 1. Eliminar entries que ya no están en la nueva lista
                for (const [key, entry] of keyedState) {
                    if (!newKeySet.has(key)) {
                        entry.cleanup();
                        let node: Node = entry.start;
                        while (node !== entry.end) {
                            const next = node.nextSibling!;
                            parent.removeChild(node);
                            node = next;
                        }
                        parent.removeChild(entry.end);
                        keyedState.delete(key);
                    }
                }

                // 2. Insertar/mover items en orden inverso para poder usar
                //    insertBefore con un insertionPoint que avanza hacia la izquierda.
                let insertionPoint: Node = anchor;
                for (let idx = newKeyOrder.length - 1; idx >= 0; idx--) {
                    const key = newKeyOrder[idx];
                    const item = v.items[idx];

                    if (keyedState.has(key)) {
                        // Item existente — mover solo si no está ya en posición
                        const entry = keyedState.get(key)!;
                        if (entry.end.nextSibling !== insertionPoint) {
                            // Recolectar nodos del item (start … end inclusive) y moverlos
                            const nodesToMove: Node[] = [];
                            let node: Node = entry.start;
                            while (true) {
                                nodesToMove.push(node);
                                if (node === entry.end) break;
                                node = node.nextSibling!;
                            }
                            for (const n of nodesToMove) {
                                parent.insertBefore(n, insertionPoint);
                            }
                        }
                        insertionPoint = entry.start;
                    } else {
                        // Item nuevo — renderizar y registrar
                        const endMarker = document.createComment("nix-ke");
                        const startMarker = document.createComment("nix-ks");
                        parent.insertBefore(endMarker, insertionPoint);
                        parent.insertBefore(startMarker, endMarker);

                        let itemCleanup: () => void;
                        const rendered = v.renderFn(item as never, idx);
                        if (isNixComponent(rendered)) {
                            let tmplCleanup!: () => void;
                            _withComponentContext(ctxSnapshot, () => {
                                try { rendered.onInit?.(); } catch (e) { if (rendered.onError) rendered.onError(e); else throw e; }
                                tmplCleanup = rendered.render()._render(parent, endMarker);
                            });
                            let mountCleanup: (() => void) | undefined;
                            try {
                                const ret = rendered.onMount?.();
                                if (typeof ret === "function") mountCleanup = ret;
                            } catch (e) {
                                if (rendered.onError) rendered.onError(e); else throw e;
                            }
                            itemCleanup = () => {
                                try { rendered.onUnmount?.(); } catch { /* ignore */ }
                                try { mountCleanup?.(); } catch { /* ignore */ }
                                tmplCleanup();
                            };
                        } else {
                            itemCleanup = rendered._render(parent, endMarker);
                        }

                        keyedState.set(key, { start: startMarker, end: endMarker, cleanup: itemCleanup });
                        insertionPoint = startMarker;
                    }
                }
            } else if (Array.isArray(v)) {
                // Lista sin keys — renderizar cada elemento (re-render completo)
                const cleanups: Array<() => void> = [];
                for (const item of v) {
                    if (isNixComponent(item)) {
                        try { item.onInit?.(); } catch (e) { if (item.onError) item.onError(e); else throw e; }
                        const templateCleanup = item.render()._render(anchor.parentNode!, anchor);
                        let mountCleanup: (() => void) | undefined;
                        try {
                            const ret = item.onMount?.();
                            if (typeof ret === "function") mountCleanup = ret;
                        } catch (e) {
                            if (item.onError) item.onError(e);
                            else throw e;
                        }
                        cleanups.push(() => {
                            try { item.onUnmount?.(); } catch { /* ignore */ }
                            try { mountCleanup?.(); } catch { /* ignore */ }
                            templateCleanup();
                        });
                    } else if (isNixTemplate(item)) {
                        cleanups.push(item._render(anchor.parentNode!, anchor));
                    } else if (item != null && item !== false) {
                        const t = document.createTextNode(String(item));
                        anchor.parentNode!.insertBefore(t, anchor);
                        cleanups.push(() => t.parentNode?.removeChild(t));
                    }
                }
                innerCleanup = () => cleanups.forEach((c) => c());
            } else {
                // Primitivo embuelto en función (primera vez o tipo cambiado)
                textNode = document.createTextNode(String(v));
                anchor.parentNode!.insertBefore(textNode, anchor);
            }
        });

        disposes.push(() => {
            dispose();
            if (innerCleanup) {
                innerCleanup();
                innerCleanup = null;
            }
            if (textNode) {
                textNode.parentNode?.removeChild(textNode);
                textNode = null;
            }
            if (keyedState) {
                for (const entry of keyedState.values()) {
                    entry.cleanup();
                }
                keyedState = null;
            }
        });
    }

    return { disposes, postMountHooks };
}

// ─── Función principal html`` ─────────────────────────────────────────────────

export function html(
    strings: TemplateStringsArray,
    ...values: unknown[]
): NixTemplate {
    // 1. Determinar el contexto de cada valor
    //
    // ⚠️  Usamos una cadena ACUMULADA en lugar de solo strings[i], porque
    //    cuando hay múltiples bindings en el MISMO tag (e.g. id="${x}" @click=${fn}),
    //    el string entre ellos es `" @click=` — sin ningún `<` ni `>` — y
    //    detectContext lo clasificaría erróneamente como "node".
    //    Al acumular todos los strings anteriores conservamos la información
    //    de que seguimos dentro de un tag abierto.
    const contexts: BindingContext[] = [];
    let accumulated = "";
    for (let i = 0; i < strings.length - 1; i++) {
        accumulated += strings[i];
        const ctx = detectContext(accumulated);
        contexts.push(ctx);
        // Avanzar el acumulado más allá del valor interpolado para que la
        // siguiente iteración sepa si seguimos dentro del mismo tag.
        // Usamos un placeholder neutro que no contiene `<` ni `>`.
        accumulated += "__nix__";
    }

    // 2. Construir el HTML estático con marcadores
    const rawHTML = buildHTML(strings, contexts);

    // ── Función interna de renderizado ────────────────────────────────────────
    function _render(parent: Node, before: Node | null): () => void {
        // 3. Parsear el HTML a un DocumentFragment
        const tpl = document.createElement("template");
        tpl.innerHTML = rawHTML;
        const fragment = tpl.content;

        // 4. Activar bindings (ANTES de insertar, para conservar referencias)
        const { disposes, postMountHooks } = activateBindings(fragment, contexts, values);

        // 5. Insertar el fragmento en el DOM
        //    El fragmento queda vacío después, pero los nodos ya están en el DOM
        //    y los disposes siguen apuntando a ellos correctamente.

        // Insertamos un "start marker" que nos permite limpiar luego
        const startMarker = document.createComment("nix-scope");
        parent.insertBefore(startMarker, before);

        // Mover todos los nodos del fragmento antes de `before`
        let child = fragment.firstChild;
        while (child) {
            const next = child.nextSibling;
            parent.insertBefore(child, before);
            child = next;
        }

        // ── Lifecycle: onMount de NixComponents embebidos ──────────────────────
        // Se dispara DESPUÉS de la inserción para que el DOM esté presente.
        postMountHooks.forEach((cb) => cb());

        // 6. Retornar función de limpieza
        return () => {
            // Destruir effects, listeners y NixComponents anidados.
            // Los onUnmount de NixComponents embebidos están dentro de disposes.
            disposes.forEach((d) => d());

            // Remover todos los nodos entre startMarker y before
            let node = startMarker.nextSibling;
            while (node && node !== before) {
                const next = node.nextSibling;
                node.parentNode?.removeChild(node);
                node = next;
            }
            startMarker.parentNode?.removeChild(startMarker);
        };
    }

    // ── API pública ────────────────────────────────────────────────────────────
    const nixTemplate: NixTemplate = {
        __isNixTemplate: true,

        _render,

        mount(container: Element | string): NixMountHandle {
            const el =
                typeof container === "string"
                    ? (document.querySelector(container) as Element)
                    : container;

            if (!el) {
                throw new Error(`[Nix] mount: contenedor no encontrado: ${container}`);
            }

            const cleanup = _render(el, null);

            return {
                unmount() {
                    cleanup();
                },
            };
        },
    };

    return nixTemplate;
}
