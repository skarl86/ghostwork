/**
 * Codex JSONL stream parser — parse `--json` output from Codex CLI.
 *
 * Events: thread.started, item.completed, turn.completed, turn.failed
 */

export type CodexEventType =
  | 'thread.started'
  | 'item.completed'
  | 'turn.completed'
  | 'turn.failed';

export interface CodexThreadStartedEvent {
  type: 'thread.started';
  thread_id?: string;
  [key: string]: unknown;
}

export interface CodexItemCompletedEvent {
  type: 'item.completed';
  item?: {
    type?: string;
    content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface CodexTurnCompletedEvent {
  type: 'turn.completed';
  thread_id?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    [key: string]: unknown;
  };
  cost_usd?: string | number;
  model?: string;
  [key: string]: unknown;
}

export interface CodexTurnFailedEvent {
  type: 'turn.failed';
  error?: string;
  [key: string]: unknown;
}

export type CodexEvent =
  | CodexThreadStartedEvent
  | CodexItemCompletedEvent
  | CodexTurnCompletedEvent
  | CodexTurnFailedEvent;

const KNOWN_TYPES = new Set<string>([
  'thread.started',
  'item.completed',
  'turn.completed',
  'turn.failed',
]);

/**
 * Parse a single JSONL line from Codex --json output.
 * Returns null for malformed lines or unknown event types.
 */
export function parseCodexJsonl(line: string): CodexEvent | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const obj = parsed as Record<string, unknown>;
    const eventType = obj['type'] as string | undefined;

    if (eventType && KNOWN_TYPES.has(eventType)) {
      return obj as CodexEvent;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Extract thread ID (session) from a thread.started or turn.completed event.
 */
export function extractCodexThreadId(event: CodexEvent): string | null {
  if (event.type === 'thread.started' || event.type === 'turn.completed') {
    return (event.thread_id as string) ?? null;
  }
  return null;
}

/**
 * Extract cost in USD from a turn.completed event.
 */
export function extractCodexCostUsd(event: CodexEvent): string | null {
  if (event.type !== 'turn.completed') return null;
  const cost = event.cost_usd;
  if (cost == null) return null;
  return String(cost);
}

/**
 * Extract usage from a turn.completed event.
 */
export function extractCodexUsage(event: CodexEvent): {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
} {
  if (event.type !== 'turn.completed' || !event.usage) {
    return { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
  }
  return {
    inputTokens: event.usage.input_tokens ?? 0,
    outputTokens: event.usage.output_tokens ?? 0,
    cachedInputTokens: 0,
  };
}

/**
 * Detect if the output indicates a turn failure.
 */
export function isCodexTurnFailed(event: CodexEvent): boolean {
  return event.type === 'turn.failed';
}
