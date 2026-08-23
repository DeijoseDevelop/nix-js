import { html, repeat, signal } from "/src/nix/index.js";

/** Shared between SSR (e2e/serve.ts) and the browser hydration client. */
export const hSize = signal("big");
export const hColor = signal("red");

export const template = html`
  <div data-h="card" class="card-${() => hSize.value}">
    <a data-h="link" href="/blog/${"post"}?q=${() => hSize.value}">go</a>
    <input data-h="input" value="pre-${() => hSize.value}" />
    <span data-h="static" class="s-${"fixed"}">${"body"}</span>
    <span data-h="plain">${() => hColor.value}</span>
  </div>
`;

export const keyedTemplate = html`
  <ul data-h="list">${repeat(
    [{ id: 1, name: "a" }, { id: 2, name: "b" }, { id: 3, name: "c" }],
    (it) => it.id,
    (it) => html`<li data-h="item" class="item-${it.id} n-${it.name}">${it.name}</li>`,
  )}</ul>
`;