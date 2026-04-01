/**
 * Plugin Worker Manager — spawns plugins as child processes,
 * communicates via JSON-RPC over stdin/stdout.
 */

import { fork, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import {
  createRequest,
  createNotification,
  parseMessage,
  serializeMessage,
  isResponse,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from './jsonrpc.js';

// ── Types ──

export interface PluginWorkerConfig {
  id: string;
  entryPath: string;
  maxRestarts?: number;
  enabled?: boolean;
}

export interface PluginWorker {
  id: string;
  config: PluginWorkerConfig;
  process: ChildProcess | null;
  status: 'stopped' | 'starting' | 'running' | 'crashed';
  restartCount: number;
  pendingRequests: Map<
    string | number,
    { resolve: (value: unknown) => void; reject: (err: Error) => void }
  >;
}

export interface WorkerManager {
  spawn(config: PluginWorkerConfig): Promise<void>;
  stop(pluginId: string): Promise<void>;
  stopAll(): Promise<void>;
  send(pluginId: string, method: string, params?: unknown): Promise<unknown>;
  notify(pluginId: string, method: string, params?: unknown): void;
  getStatus(pluginId: string): PluginWorker['status'] | null;
  listWorkers(): Array<{ id: string; status: PluginWorker['status'] }>;
}

const DEFAULT_MAX_RESTARTS = 3;
const SHUTDOWN_TIMEOUT_MS = 5000;

let rpcIdCounter = 0;

export function createWorkerManager(): WorkerManager {
  const workers = new Map<string, PluginWorker>();

  function setupProcess(worker: PluginWorker): void {
    const child = fork(worker.config.entryPath, [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      silent: true,
    });

    worker.process = child;
    worker.status = 'running';

    // Read JSON-RPC responses from stdout
    if (child.stdout) {
      const rl = createInterface({ input: child.stdout });
      rl.on('line', (line: string) => {
        const msg = parseMessage(line);
        if (!msg) return;
        if (isResponse(msg)) {
          const response = msg as JsonRpcResponse;
          const id = response.id;
          if (id == null) return;
          const pending = worker.pendingRequests.get(id);
          if (pending) {
            worker.pendingRequests.delete(id);
            if ('error' in response) {
              pending.reject(new Error(response.error.message));
            } else {
              pending.resolve(response.result);
            }
          }
        }
      });
    }

    child.on('exit', (code) => {
      worker.process = null;
      if (code !== 0 && code !== null) {
        worker.status = 'crashed';
        // Auto-restart with exponential backoff
        const maxRestarts = worker.config.maxRestarts ?? DEFAULT_MAX_RESTARTS;
        if (worker.restartCount < maxRestarts) {
          worker.restartCount++;
          const delay = Math.pow(2, worker.restartCount) * 1000;
          setTimeout(() => {
            if (worker.status === 'crashed') {
              worker.status = 'starting';
              setupProcess(worker);
            }
          }, delay);
        }
      } else {
        worker.status = 'stopped';
      }

      // Reject all pending requests
      for (const [id, pending] of worker.pendingRequests) {
        pending.reject(new Error('Plugin worker exited'));
        worker.pendingRequests.delete(id);
      }
    });

    child.on('error', () => {
      worker.status = 'crashed';
    });
  }

  return {
    async spawn(config) {
      if (workers.has(config.id)) {
        await this.stop(config.id);
      }

      const worker: PluginWorker = {
        id: config.id,
        config,
        process: null,
        status: 'starting',
        restartCount: 0,
        pendingRequests: new Map(),
      };

      workers.set(config.id, worker);
      setupProcess(worker);
    },

    async stop(pluginId) {
      const worker = workers.get(pluginId);
      if (!worker || !worker.process) return;

      // Try graceful shutdown via RPC
      try {
        const shutdownMsg = serializeMessage(
          createRequest('shutdown', undefined, ++rpcIdCounter),
        );
        worker.process.stdin?.write(shutdownMsg + '\n');
      } catch {
        // ignore write errors
      }

      // Wait for graceful exit, then force kill
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          worker.process?.kill('SIGKILL');
          resolve();
        }, SHUTDOWN_TIMEOUT_MS);

        worker.process?.on('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });

      worker.status = 'stopped';
      worker.process = null;
    },

    async stopAll() {
      const ids = [...workers.keys()];
      await Promise.all(ids.map((id) => this.stop(id)));
    },

    async send(pluginId, method, params?) {
      const worker = workers.get(pluginId);
      if (!worker?.process?.stdin) {
        throw new Error(`Plugin ${pluginId} is not running`);
      }

      const id = ++rpcIdCounter;
      const request: JsonRpcRequest = createRequest(method, params, id);
      const line = serializeMessage(request);

      return new Promise<unknown>((resolve, reject) => {
        worker.pendingRequests.set(id, { resolve, reject });
        worker.process!.stdin!.write(line + '\n');

        // Timeout after 30s
        setTimeout(() => {
          if (worker.pendingRequests.has(id)) {
            worker.pendingRequests.delete(id);
            reject(new Error(`RPC timeout: ${method}`));
          }
        }, 30_000);
      });
    },

    notify(pluginId, method, params?) {
      const worker = workers.get(pluginId);
      if (!worker?.process?.stdin) return;

      const notification = createNotification(method, params);
      const line = serializeMessage(notification);
      worker.process.stdin.write(line + '\n');
    },

    getStatus(pluginId) {
      const worker = workers.get(pluginId);
      return worker?.status ?? null;
    },

    listWorkers() {
      return [...workers.values()].map((w) => ({ id: w.id, status: w.status }));
    },
  };
}
