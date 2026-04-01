/**
 * Shared types for the heartbeat engine.
 */

export interface ProcessHandle {
  pid: number | null;
  runId: string;
  agentId: string;
}
