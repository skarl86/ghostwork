/**
 * Adapter Registry — manages the set of available adapters.
 */

import type { ServerAdapterModule } from './types.js';

export interface AdapterRegistry {
  register(adapter: ServerAdapterModule): void;
  get(type: string): ServerAdapterModule | undefined;
  list(): ServerAdapterModule[];
}

/**
 * Create an adapter registry.
 *
 * @param builtInAdapters - adapters to register on creation
 */
export function createAdapterRegistry(
  builtInAdapters: ServerAdapterModule[] = [],
): AdapterRegistry {
  const adapters = new Map<string, ServerAdapterModule>();

  for (const adapter of builtInAdapters) {
    adapters.set(adapter.type, adapter);
  }

  return {
    register(adapter: ServerAdapterModule): void {
      adapters.set(adapter.type, adapter);
    },

    get(type: string): ServerAdapterModule | undefined {
      return adapters.get(type);
    },

    list(): ServerAdapterModule[] {
      return [...adapters.values()];
    },
  };
}
