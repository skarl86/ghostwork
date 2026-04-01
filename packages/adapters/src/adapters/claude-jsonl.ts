/**
 * Claude JSONL stream parser — parse `--output-format stream-json` output.
 *
 * Events: system, init, assistant, result
 */

export type ClaudeEventType = 'system' | 'init' | 'assistant' | 'result';

export interface ClaudeSystemEvent {
  type: 'system';
  message?: string;
  [key: string]: unknown;
}

export interface ClaudeInitEvent {
  type: 'init';
  session_id?: string;
  model?: string;
  [key: string]: unknown;
}

export interface ClaudeAssistantEvent {
  type: 'assistant';
  message?: {
    content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ClaudeResultEvent {
  type: 'result';
  session_id?: string;
  total_cost_usd?: string | number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    [key: string]: unknown;
  };
  model?: string;
  [key: string]: unknown;
}

export type ClaudeEvent =
  | ClaudeSystemEvent
  | ClaudeInitEvent
  | ClaudeAssistantEvent
  | ClaudeResultEvent;

/**
 * Parse a single JSONL line from Claude stream-json output.
 * Returns null for malformed lines or unknown event types.
 */
export function parseClaudeStreamJson(line: string): ClaudeEvent | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const obj = parsed as Record<string, unknown>;
    const eventType = obj['type'];

    if (
      eventType === 'system' ||
      eventType === 'init' ||
      eventType === 'assistant' ||
      eventType === 'result'
    ) {
      return obj as ClaudeEvent;
    }

    // Unknown event type — skip
    return null;
  } catch {
    // Malformed JSON — skip
    return null;
  }
}

/**
 * Extract session ID from a result or init event.
 */
export function extractSessionId(event: ClaudeEvent): string | null {
  if (event.type === 'result' || event.type === 'init') {
    return (event.session_id as string) ?? null;
  }
  return null;
}

/**
 * Extract cost in USD from a result event.
 */
export function extractCostUsd(event: ClaudeEvent): string | null {
  if (event.type !== 'result') return null;
  const cost = event.total_cost_usd;
  if (cost == null) return null;
  return String(cost);
}

/**
 * Extract usage from a result event.
 */
export function extractUsage(event: ClaudeEvent): {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
} {
  if (event.type !== 'result' || !event.usage) {
    return { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
  }
  return {
    inputTokens: event.usage.input_tokens ?? 0,
    outputTokens: event.usage.output_tokens ?? 0,
    cachedInputTokens: event.usage.cache_read_input_tokens ?? 0,
  };
}

/**
 * Detect if the output indicates an unknown session error.
 */
export function isClaudeUnknownSessionError(output: string): boolean {
  return /unknown session/i.test(output) || /session.*not found/i.test(output);
}

/**
 * Detect if the output indicates a login/auth requirement.
 */
export function detectClaudeLoginRequired(output: string): boolean {
  return (
    /please log\s*in/i.test(output) ||
    /login required/i.test(output) ||
    /authentication required/i.test(output) ||
    /not authenticated/i.test(output)
  );
}
