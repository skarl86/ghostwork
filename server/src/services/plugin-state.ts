/**
 * Plugin State Store — scoped key-value store for plugin persistent state.
 *
 * Uses an in-memory Map as the backing store for simplicity.
 * In production, this would be backed by a database table with JSONB.
 */

// ── Types ──

export interface PluginStateEntry {
  pluginId: string;
  scopeKind: string;
  scopeId: string;
  stateKey: string;
  value: unknown;
  updatedAt: string;
}

export interface PluginStateStore {
  get(pluginId: string, scopeKind: string, scopeId: string, key: string): Promise<unknown>;
  set(
    pluginId: string,
    scopeKind: string,
    scopeId: string,
    key: string,
    value: unknown,
  ): Promise<void>;
  delete(pluginId: string, scopeKind: string, scopeId: string, key: string): Promise<boolean>;
  list(
    pluginId: string,
    scopeKind?: string,
    scopeId?: string,
  ): Promise<Array<{ key: string; value: unknown }>>;
  clear(pluginId: string): Promise<void>;
}

// ── Implementation ──

function makeKey(pluginId: string, scopeKind: string, scopeId: string, stateKey: string): string {
  return `${pluginId}:${scopeKind}:${scopeId}:${stateKey}`;
}

export function createPluginStateStore(): PluginStateStore {
  const store = new Map<string, PluginStateEntry>();

  return {
    async get(pluginId, scopeKind, scopeId, key) {
      const entry = store.get(makeKey(pluginId, scopeKind, scopeId, key));
      return entry?.value ?? null;
    },

    async set(pluginId, scopeKind, scopeId, key, value) {
      const k = makeKey(pluginId, scopeKind, scopeId, key);
      store.set(k, {
        pluginId,
        scopeKind,
        scopeId,
        stateKey: key,
        value,
        updatedAt: new Date().toISOString(),
      });
    },

    async delete(pluginId, scopeKind, scopeId, key) {
      return store.delete(makeKey(pluginId, scopeKind, scopeId, key));
    },

    async list(pluginId, scopeKind?, scopeId?) {
      const results: Array<{ key: string; value: unknown }> = [];
      for (const entry of store.values()) {
        if (entry.pluginId !== pluginId) continue;
        if (scopeKind && entry.scopeKind !== scopeKind) continue;
        if (scopeId && entry.scopeId !== scopeId) continue;
        results.push({ key: entry.stateKey, value: entry.value });
      }
      return results;
    },

    async clear(pluginId) {
      for (const [key, entry] of store.entries()) {
        if (entry.pluginId === pluginId) {
          store.delete(key);
        }
      }
    },
  };
}
