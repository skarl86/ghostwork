/**
 * @paperclip/adapters — Agent adapter interfaces (placeholder)
 *
 * Phase 4에서 claude-local, process 어댑터 구현 예정
 */

export interface AdapterExecutionResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  costUsd: string | null;
  summary: string | null;
}

export interface ServerAdapterModule {
  type: string;
  execute(context: unknown): Promise<AdapterExecutionResult>;
  testEnvironment(context: unknown): Promise<{ success: boolean; error?: string }>;
}
