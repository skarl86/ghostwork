import { describe, it, expect } from 'vitest';
import {
  parseClaudeStreamJson,
  extractSessionId,
  extractCostUsd,
  extractUsage,
  isClaudeUnknownSessionError,
  detectClaudeLoginRequired,
} from './claude-jsonl.js';

describe('parseClaudeStreamJson', () => {
  it('parses system event', () => {
    const line = JSON.stringify({ type: 'system', message: 'initialized' });
    const event = parseClaudeStreamJson(line);

    expect(event).not.toBeNull();
    expect(event!.type).toBe('system');
  });

  it('parses init event', () => {
    const line = JSON.stringify({
      type: 'init',
      session_id: 'sess-123',
      model: 'claude-sonnet-4-20250514',
    });
    const event = parseClaudeStreamJson(line);

    expect(event).not.toBeNull();
    expect(event!.type).toBe('init');
    if (event!.type === 'init') {
      expect(event!.session_id).toBe('sess-123');
    }
  });

  it('parses assistant event', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'Hello, world!' }],
      },
    });
    const event = parseClaudeStreamJson(line);

    expect(event).not.toBeNull();
    expect(event!.type).toBe('assistant');
  });

  it('parses result event with cost and usage', () => {
    const line = JSON.stringify({
      type: 'result',
      session_id: 'sess-abc',
      total_cost_usd: '0.0042',
      usage: {
        input_tokens: 150,
        output_tokens: 75,
        cache_read_input_tokens: 20,
      },
      model: 'claude-sonnet-4-20250514',
    });
    const event = parseClaudeStreamJson(line);

    expect(event).not.toBeNull();
    expect(event!.type).toBe('result');
  });

  it('returns null for empty string', () => {
    expect(parseClaudeStreamJson('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(parseClaudeStreamJson('   ')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseClaudeStreamJson('not json at all')).toBeNull();
    expect(parseClaudeStreamJson('{broken')).toBeNull();
  });

  it('returns null for JSON that is not an object', () => {
    expect(parseClaudeStreamJson('"just a string"')).toBeNull();
    expect(parseClaudeStreamJson('42')).toBeNull();
    expect(parseClaudeStreamJson('null')).toBeNull();
  });

  it('returns null for unknown event type', () => {
    const line = JSON.stringify({ type: 'unknown_event', data: 'test' });
    expect(parseClaudeStreamJson(line)).toBeNull();
  });

  it('handles line with leading/trailing whitespace', () => {
    const line = `  ${JSON.stringify({ type: 'system', message: 'ok' })}  `;
    const event = parseClaudeStreamJson(line);

    expect(event).not.toBeNull();
    expect(event!.type).toBe('system');
  });
});

describe('extractSessionId', () => {
  it('extracts from result event', () => {
    const event = parseClaudeStreamJson(
      JSON.stringify({ type: 'result', session_id: 'sess-xyz' }),
    )!;
    expect(extractSessionId(event)).toBe('sess-xyz');
  });

  it('extracts from init event', () => {
    const event = parseClaudeStreamJson(
      JSON.stringify({ type: 'init', session_id: 'sess-init' }),
    )!;
    expect(extractSessionId(event)).toBe('sess-init');
  });

  it('returns null for assistant event', () => {
    const event = parseClaudeStreamJson(
      JSON.stringify({ type: 'assistant', message: {} }),
    )!;
    expect(extractSessionId(event)).toBeNull();
  });

  it('returns null when session_id missing', () => {
    const event = parseClaudeStreamJson(
      JSON.stringify({ type: 'result' }),
    )!;
    expect(extractSessionId(event)).toBeNull();
  });
});

describe('extractCostUsd', () => {
  it('extracts string cost from result', () => {
    const event = parseClaudeStreamJson(
      JSON.stringify({ type: 'result', total_cost_usd: '0.0042' }),
    )!;
    expect(extractCostUsd(event)).toBe('0.0042');
  });

  it('converts numeric cost to string', () => {
    const event = parseClaudeStreamJson(
      JSON.stringify({ type: 'result', total_cost_usd: 0.005 }),
    )!;
    expect(extractCostUsd(event)).toBe('0.005');
  });

  it('returns null for non-result event', () => {
    const event = parseClaudeStreamJson(
      JSON.stringify({ type: 'assistant', message: {} }),
    )!;
    expect(extractCostUsd(event)).toBeNull();
  });

  it('returns null when cost not present', () => {
    const event = parseClaudeStreamJson(
      JSON.stringify({ type: 'result' }),
    )!;
    expect(extractCostUsd(event)).toBeNull();
  });
});

describe('extractUsage', () => {
  it('extracts full usage from result', () => {
    const event = parseClaudeStreamJson(
      JSON.stringify({
        type: 'result',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 20,
        },
      }),
    )!;

    expect(extractUsage(event)).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      cachedInputTokens: 20,
    });
  });

  it('defaults missing fields to 0', () => {
    const event = parseClaudeStreamJson(
      JSON.stringify({ type: 'result', usage: { input_tokens: 42 } }),
    )!;

    expect(extractUsage(event)).toEqual({
      inputTokens: 42,
      outputTokens: 0,
      cachedInputTokens: 0,
    });
  });

  it('returns zeros for non-result event', () => {
    const event = parseClaudeStreamJson(
      JSON.stringify({ type: 'system', message: 'ok' }),
    )!;

    expect(extractUsage(event)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
    });
  });

  it('returns zeros when usage not present', () => {
    const event = parseClaudeStreamJson(
      JSON.stringify({ type: 'result' }),
    )!;

    expect(extractUsage(event)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
    });
  });
});

describe('isClaudeUnknownSessionError', () => {
  it('detects "Unknown session" error', () => {
    expect(isClaudeUnknownSessionError('Error: Unknown session ID "sess-expired"')).toBe(true);
  });

  it('detects "session not found" error', () => {
    expect(isClaudeUnknownSessionError('Session "abc" not found')).toBe(true);
  });

  it('returns false for normal output', () => {
    expect(isClaudeUnknownSessionError('Task completed successfully')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isClaudeUnknownSessionError('')).toBe(false);
  });
});

describe('detectClaudeLoginRequired', () => {
  it('detects "please log in"', () => {
    expect(detectClaudeLoginRequired('Please log in to continue')).toBe(true);
  });

  it('detects "login required"', () => {
    expect(detectClaudeLoginRequired('Login required')).toBe(true);
  });

  it('detects "authentication required"', () => {
    expect(detectClaudeLoginRequired('Authentication required')).toBe(true);
  });

  it('detects "not authenticated"', () => {
    expect(detectClaudeLoginRequired('User is not authenticated')).toBe(true);
  });

  it('returns false for normal output', () => {
    expect(detectClaudeLoginRequired('Done')).toBe(false);
  });
});
