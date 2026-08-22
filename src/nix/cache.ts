/**
 * Cache adapter interface for ISR (Incremental Static Regeneration) and
 * server-side caching. (v3.1 — Fix #3)
 *
 * Adapters are pluggable: use filesystem for persistent deployments,
 * memory for development, or Redis/Upstash/Cloudflare KV for serverless.
 */

export interface CacheEntry<T = unknown> {
    /** Cached value. */
    data: T;
    /** When the entry was stored (epoch ms). */
    storedAt: number;
    /** Time-to-live in ms. 0 = no expiry. */
    ttl: number;
    /** Optional tags for tag-based invalidation. */
    tags?: string[];
}

export interface CacheAdapter {
    /** Get a cached entry by key. Returns undefined on miss or expiry. */
    get<T = unknown>(key: string): Promise<CacheEntry<T> | undefined>;
    /** Store a value with optional TTL and tags. */
    set<T = unknown>(key: string, data: T, options?: { ttl?: number; tags?: string[] }): Promise<void>;
    /** Delete a specific key. */
    delete(key: string): Promise<void>;
    /** Invalidate all entries with the given tag. */
    invalidateTag(tag: string): Promise<void>;
    /** Clear all entries. */
    clear(): Promise<void>;
}

// ─── Memory Cache Adapter ───────────────────────────────────────────────────

export class MemoryCacheAdapter implements CacheAdapter {
    private _store = new Map<string, CacheEntry>();

    async get<T = unknown>(key: string): Promise<CacheEntry<T> | undefined> {
        const entry = this._store.get(key);
        if (!entry) return undefined;
        if (entry.ttl > 0 && Date.now() - entry.storedAt > entry.ttl) {
            this._store.delete(key);
            return undefined;
        }
        return entry as CacheEntry<T>;
    }

    async set<T = unknown>(key: string, data: T, options?: { ttl?: number; tags?: string[] }): Promise<void> {
        this._store.set(key, {
            data,
            storedAt: Date.now(),
            ttl: options?.ttl ?? 0,
            tags: options?.tags,
        });
    }

    async delete(key: string): Promise<void> {
        this._store.delete(key);
    }

    async invalidateTag(tag: string): Promise<void> {
        for (const [key, entry] of this._store) {
            if (entry.tags?.includes(tag)) {
                this._store.delete(key);
            }
        }
    }

    async clear(): Promise<void> {
        this._store.clear();
    }
}

// ─── Filesystem Cache Adapter ───────────────────────────────────────────────

import { readFileSync, writeFileSync, unlinkSync, mkdirSync, readdirSync, existsSync } from "fs";
import { resolve, join } from "path";

export class FilesystemCacheAdapter implements CacheAdapter {
    private _dir: string;

    constructor(dir: string) {
        this._dir = resolve(dir);
        if (!existsSync(this._dir)) {
            mkdirSync(this._dir, { recursive: true });
        }
    }

    private _path(key: string): string {
        return join(this._dir, encodeURIComponent(key) + ".json");
    }

    async get<T = unknown>(key: string): Promise<CacheEntry<T> | undefined> {
        const path = this._path(key);
        if (!existsSync(path)) return undefined;
        try {
            const raw = readFileSync(path, "utf-8");
            const entry = JSON.parse(raw) as CacheEntry<T>;
            if (entry.ttl > 0 && Date.now() - entry.storedAt > entry.ttl) {
                unlinkSync(path);
                return undefined;
            }
            return entry;
        } catch {
            return undefined;
        }
    }

    async set<T = unknown>(key: string, data: T, options?: { ttl?: number; tags?: string[] }): Promise<void> {
        const entry: CacheEntry<T> = {
            data,
            storedAt: Date.now(),
            ttl: options?.ttl ?? 0,
            tags: options?.tags,
        };
        writeFileSync(this._path(key), JSON.stringify(entry), "utf-8");
    }

    async delete(key: string): Promise<void> {
        const path = this._path(key);
        if (existsSync(path)) {
            try { unlinkSync(path); } catch { /* ignore */ }
        }
    }

    async invalidateTag(tag: string): Promise<void> {
        if (!existsSync(this._dir)) return;
        for (const file of readdirSync(this._dir)) {
            if (!file.endsWith(".json")) continue;
            const path = join(this._dir, file);
            try {
                const raw = readFileSync(path, "utf-8");
                const entry = JSON.parse(raw) as CacheEntry;
                if (entry.tags?.includes(tag)) {
                    try { unlinkSync(path); } catch { /* ignore */ }
                }
            } catch { /* ignore corrupt files */ }
        }
    }

    async clear(): Promise<void> {
        if (!existsSync(this._dir)) return;
        for (const file of readdirSync(this._dir)) {
            if (file.endsWith(".json")) {
                try { unlinkSync(join(this._dir, file)); } catch { /* ignore */ }
            }
        }
    }
}

// ─── Redis Cache Adapter (for serverless: Upstash, Redis Cloud, etc.) ────────

export interface RedisCacheAdapterOptions {
    /** Redis client with get/set/del/keys commands (node-redis, ioredis, Upstash). */
    client: {
        get(key: string): Promise<string | null>;
        set(key: string, value: string, opts?: { EX?: number; PX?: number }): Promise<unknown>;
        del(key: string | string[]): Promise<number>;
        keys(pattern: string): Promise<string[]>;
    };
    /** Key prefix to namespace cache entries. */
    prefix?: string;
}

export class RedisCacheAdapter implements CacheAdapter {
    private _client: RedisCacheAdapterOptions["client"];
    private _prefix: string;

    constructor(options: RedisCacheAdapterOptions) {
        this._client = options.client;
        this._prefix = options.prefix ?? "nix-cache:";
    }

    private _key(key: string): string {
        return this._prefix + key;
    }

    async get<T = unknown>(key: string): Promise<CacheEntry<T> | undefined> {
        const raw = await this._client.get(this._key(key));
        if (!raw) return undefined;
        try {
            const entry = JSON.parse(raw) as CacheEntry<T>;
            if (entry.ttl > 0 && Date.now() - entry.storedAt > entry.ttl) {
                await this._client.del(this._key(key));
                return undefined;
            }
            return entry;
        } catch {
            return undefined;
        }
    }

    async set<T = unknown>(key: string, data: T, options?: { ttl?: number; tags?: string[] }): Promise<void> {
        const entry: CacheEntry<T> = {
            data,
            storedAt: Date.now(),
            ttl: options?.ttl ?? 0,
            tags: options?.tags,
        };
        const fullKey = this._key(key);
        const value = JSON.stringify(entry);
        if (options?.ttl && options.ttl > 0) {
            await this._client.set(fullKey, value, { PX: options.ttl });
        } else {
            await this._client.set(fullKey, value);
        }
        // Store tag index for tag-based invalidation.
        if (options?.tags?.length) {
            for (const tag of options.tags) {
                const tagKey = this._prefix + "tag:" + tag;
                const existing = await this._client.get(tagKey);
                const keys = existing ? JSON.parse(existing) as string[] : [];
                if (!keys.includes(fullKey)) {
                    keys.push(fullKey);
                    await this._client.set(tagKey, JSON.stringify(keys));
                }
            }
        }
    }

    async delete(key: string): Promise<void> {
        await this._client.del(this._key(key));
    }

    async invalidateTag(tag: string): Promise<void> {
        const tagKey = this._prefix + "tag:" + tag;
        const raw = await this._client.get(tagKey);
        if (!raw) return;
        const keys = JSON.parse(raw) as string[];
        if (keys.length > 0) {
            await this._client.del(keys);
        }
        await this._client.del(tagKey);
    }

    async clear(): Promise<void> {
        const keys = await this._client.keys(this._prefix + "*");
        if (keys.length > 0) {
            await this._client.del(keys);
        }
    }
}
