/**
 * Adapter System — Core type definitions.
 *
 * Based on blueprint 04-adapter-system.md sections 2-3.
 */

import type { ChildProcess } from 'node:child_process';

// ── ServerAdapterModule ──

export interface ServerAdapterModule {
  /** Unique adapter identifier (e.g. "claude-local", "process") */
  type: string;

  /** [Required] Execute an agent task */
  execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult>;

  /** [Required] Test if the execution environment is ready */
  testEnvironment(ctx: AdapterExecutionContext): Promise<AdapterEnvironmentTestResult>;

  /** [Optional] List currently installed skills */
  listSkills?(ctx: AdapterExecutionContext): Promise<AdapterSkillSnapshot>;

  /** [Optional] Sync to a desired set of skills */
  syncSkills?(
    ctx: AdapterExecutionContext,
    desiredSkills: string[],
  ): Promise<AdapterSkillSnapshot>;

  /** [Optional] Session serialization codec */
  sessionCodec?: AdapterSessionCodec;

  /** [Optional] Statically known models */
  models?: AdapterModel[];

  /** [Optional] Dynamically query available models */
  listModels?(): Promise<AdapterModel[]>;
}

// ── Execution Context ──

export interface AdapterExecutionContext {
  runId: string;

  agent: {
    id: string;
    companyId: string;
    name: string;
    adapterType: string;
  };

  runtime: {
    sessionId: string | null;
    sessionParams: Record<string, unknown> | null;
    taskKey: string;
  };

  config: Record<string, unknown>;
  context: Record<string, unknown>;

  onLog: (stream: 'stdout' | 'stderr', chunk: string) => void;
  onMeta?: (meta: Record<string, unknown>) => void;
  onSpawn?: (info: SpawnInfo) => void;

  authToken: string;
}

export interface SpawnInfo {
  pid: number | null;
  command: string;
}

// ── Execution Result ──

export interface AdapterExecutionResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;

  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
  };

  sessionId: string | null;
  sessionParams: Record<string, unknown> | null;

  provider: string | null;
  biller: string | null;
  model: string | null;
  billingType: 'api' | 'subscription' | null;
  costUsd: string | null;

  resultJson?: unknown;
  summary: string | null;
  clearSession: boolean;
}

// ── Environment Test ──

export interface AdapterEnvironmentTestResult {
  ok: boolean;
  error?: string;
  details?: Record<string, unknown>;
}

// ── ProcessHandle ──

export interface ProcessHandle {
  pid: number | null;
  kill: () => void;
  process?: ChildProcess;
}

// ── Skill types ──

export type SkillStatus =
  | 'available'
  | 'configured'
  | 'installed'
  | 'missing'
  | 'stale'
  | 'external';

export interface SkillInfo {
  name: string;
  status: SkillStatus;
  path?: string;
}

export interface AdapterSkillSnapshot {
  skills: SkillInfo[];
}

// ── Session Codec ──

export interface AdapterSessionCodec {
  serialize(sessionId: string, params?: Record<string, unknown>): string;
  deserialize(data: string): { sessionId: string; params?: Record<string, unknown> };
}

// ── Model ──

export interface AdapterModel {
  id: string;
  name: string;
  provider: string;
}

// ── Child Process Options ──

export interface RunChildProcessOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  stdin?: string;
  timeoutMs?: number;
  onLog?: (stream: 'stdout' | 'stderr', chunk: string) => void;
}

export interface RunChildProcessResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
}

export interface ChildProcessHandle {
  handle: ProcessHandle;
  result: Promise<RunChildProcessResult>;
}
