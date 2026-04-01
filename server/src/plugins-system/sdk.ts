/**
 * Plugin SDK — Definition helper and context types for Ghostwork plugins.
 *
 * Plugins run as child processes communicating via JSON-RPC over stdin/stdout.
 */

// ── Plugin Context Types ──

export interface PluginEventSubscription {
  type: string;
  handler: (payload: unknown) => void | Promise<void>;
}

export interface PluginEventsContext {
  on(eventType: string, handler: (payload: unknown) => void | Promise<void>): void;
}

export interface PluginJobsContext {
  register(name: string, handler: () => void | Promise<void>): void;
  run(name: string): Promise<void>;
}

export interface PluginDataContext {
  provide(key: string, resolver: () => unknown | Promise<unknown>): void;
}

export interface PluginStateContext {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  list(): Promise<Array<{ key: string; value: unknown }>>;
}

export interface PluginLogger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

export interface PluginContext {
  events: PluginEventsContext;
  jobs: PluginJobsContext;
  data: PluginDataContext;
  state: PluginStateContext;
  logger: PluginLogger;
}

// ── Plugin Config ──

export interface PluginConfig {
  id: string;
  name: string;
  version: string;
  description?: string;
  setup: (ctx: PluginContext) => void | Promise<void>;
}

export interface PluginDefinition {
  id: string;
  name: string;
  version: string;
  description?: string;
  setup: (ctx: PluginContext) => void | Promise<void>;
}

/**
 * Define a plugin. This is the entry point for plugin authors.
 */
export function definePlugin(config: PluginConfig): PluginDefinition {
  return {
    id: config.id,
    name: config.name,
    version: config.version,
    description: config.description,
    setup: config.setup,
  };
}
