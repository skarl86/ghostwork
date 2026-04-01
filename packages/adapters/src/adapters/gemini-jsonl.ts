/**
 * Gemini JSONL stream parser — parse `--json` output from Gemini CLI.
 *
 * Events: system, assistant, text, result, error
 */

export type GeminiEventType = 'system' | 'assistant' | 'text' | 'result' | 'error';

export interface GeminiSystemEvent {
  type: 'system';
  message?: string;
  [key: string]: unknown;
}

export interface GeminiAssistantEvent {
  type: 'assistant';
  message?: {
    content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface GeminiTextEvent {
  type: 'text';
  text?: string;
  [key: string]: unknown;
}

export interface GeminiResultEvent {
  type: 'result';
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    [key: string]: unknown;
  };
  model?: string;
  cost_usd?: string | number;
  [key: string]: unknown;
}

export interface GeminiErrorEvent {
  type: 'error';
  error?: string;
  message?: string;
  [key: string]: unknown;
}

export type GeminiEvent =
  | GeminiSystemEvent
  | GeminiAssistantEvent
  | GeminiTextEvent
  | GeminiResultEvent
  | GeminiErrorEvent;

const KNOWN_TYPES = new Set<string>([
  'system',
  'assistant',
  'text',
  'result',
  'error',
]);

/**
 * Parse a single JSONL line from Gemini --json output.
 * Returns null for malformed lines or unknown event types.
 */
export function parseGeminiJsonl(line: string): GeminiEvent | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const obj = parsed as Record<string, unknown>;
    const eventType = obj['type'] as string | undefined;

    if (eventType && KNOWN_TYPES.has(eventType)) {
      return obj as GeminiEvent;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Extract usage from a result event.
 */
export function extractGeminiUsage(event: GeminiEvent): {
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
    cachedInputTokens: 0,
  };
}

/**
 * Extract cost in USD from a result event.
 */
export function extractGeminiCostUsd(event: GeminiEvent): string | null {
  if (event.type !== 'result') return null;
  const cost = event.cost_usd;
  if (cost == null) return null;
  return String(cost);
}

/**
 * Extract model name from a result event.
 */
export function extractGeminiModel(event: GeminiEvent): string | null {
  if (event.type !== 'result') return null;
  return (event.model as string) ?? null;
}

/**
 * Detect if the output indicates an auth/login requirement.
 */
export function detectGeminiAuthRequired(output: string): boolean {
  return (
    /authentication required/i.test(output) ||
    /not authenticated/i.test(output) ||
    /login required/i.test(output) ||
    /please log\s*in/i.test(output) ||
    /invalid credentials/i.test(output) ||
    /gcloud auth/i.test(output)
  );
}
