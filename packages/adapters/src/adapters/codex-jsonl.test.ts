import { describe, it, expect } from 'vitest';
import {
  parseCodexJsonl,
  extractCodexThreadId,
  extractCodexCostUsd,
  extractCodexUsage,
  isCodexTurnFailed,
} from './codex-jsonl.js';

describe('parseCodexJsonl', () => {
  it('parses thread.started event', () => {
    const line = JSON.stringify({ type: 'thread.started', thread_id: 'thread-abc' });
    const event = parseCodexJsonl(line);

    expect(event).not.toBeNull();
    expect(event!.type).toBe('thread.started');
    if (event!.type === 'thread.started') {
      expect(event!.thread_id).toBe('thread-abc');
    }
  });

  it('parses item.completed event', () => {
    const line = JSON.stringify({
      type: 'item.completed',
      item: {
        type: 'message',
        content: [{ type: 'text', text: 'Done' }],
      },
    });
    const event = parseCodexJsonl(line);

    expect(event).not.toBeNull();
    expect(event!.type).toBe('item.completed');
  });

  it('parses turn.completed event with usage', () => {
    const line = JSON.stringify({
      type: 'turn.completed',
      thread_id: 'thread-xyz',
      usage: { input_tokens: 200, output_tokens: 100, total_tokens: 300 },
      cost_usd: '0.003',
      model: 'codex-mini',
    });
    const event = parseCodexJsonl(line);

    expect(event).not.toBeNull();
    expect(event!.type).toBe('turn.completed');
  });

  it('parses turn.failed event', () => {
    const line = JSON.stringify({
      type: 'turn.failed',
      error: 'Rate limit exceeded',
    });
    const event = parseCodexJsonl(line);

    expect(event).not.toBeNull();
    expect(event!.type).toBe('turn.failed');
  });

  it('returns null for empty string', () => {
    expect(parseCodexJsonl('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(parseCodexJsonl('   ')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseCodexJsonl('not json')).toBeNull();
    expect(parseCodexJsonl('{broken')).toBeNull();
  });

  it('returns null for non-object JSON', () => {
    expect(parseCodexJsonl('"string"')).toBeNull();
    expect(parseCodexJsonl('42')).toBeNull();
    expect(parseCodexJsonl('null')).toBeNull();
  });

  it('returns null for unknown event type', () => {
    const line = JSON.stringify({ type: 'unknown_event', data: 'test' });
    expect(parseCodexJsonl(line)).toBeNull();
  });

  it('handles line with leading/trailing whitespace', () => {
    const line = `  ${JSON.stringify({ type: 'thread.started', thread_id: 't1' })}  `;
    const event = parseCodexJsonl(line);

    expect(event).not.toBeNull();
    expect(event!.type).toBe('thread.started');
  });
});

describe('extractCodexThreadId', () => {
  it('extracts from thread.started event', () => {
    const event = parseCodexJsonl(
      JSON.stringify({ type: 'thread.started', thread_id: 'thread-123' }),
    )!;
    expect(extractCodexThreadId(event)).toBe('thread-123');
  });

  it('extracts from turn.completed event', () => {
    const event = parseCodexJsonl(
      JSON.stringify({ type: 'turn.completed', thread_id: 'thread-456' }),
    )!;
    expect(extractCodexThreadId(event)).toBe('thread-456');
  });

  it('returns null for item.completed event', () => {
    const event = parseCodexJsonl(
      JSON.stringify({ type: 'item.completed', item: {} }),
    )!;
    expect(extractCodexThreadId(event)).toBeNull();
  });

  it('returns null when thread_id missing', () => {
    const event = parseCodexJsonl(
      JSON.stringify({ type: 'thread.started' }),
    )!;
    expect(extractCodexThreadId(event)).toBeNull();
  });
});

describe('extractCodexCostUsd', () => {
  it('extracts string cost from turn.completed', () => {
    const event = parseCodexJsonl(
      JSON.stringify({ type: 'turn.completed', cost_usd: '0.0042' }),
    )!;
    expect(extractCodexCostUsd(event)).toBe('0.0042');
  });

  it('converts numeric cost to string', () => {
    const event = parseCodexJsonl(
      JSON.stringify({ type: 'turn.completed', cost_usd: 0.005 }),
    )!;
    expect(extractCodexCostUsd(event)).toBe('0.005');
  });

  it('returns null for non-turn.completed event', () => {
    const event = parseCodexJsonl(
      JSON.stringify({ type: 'thread.started', thread_id: 't1' }),
    )!;
    expect(extractCodexCostUsd(event)).toBeNull();
  });

  it('returns null when cost not present', () => {
    const event = parseCodexJsonl(
      JSON.stringify({ type: 'turn.completed' }),
    )!;
    expect(extractCodexCostUsd(event)).toBeNull();
  });
});

describe('extractCodexUsage', () => {
  it('extracts full usage from turn.completed', () => {
    const event = parseCodexJsonl(
      JSON.stringify({
        type: 'turn.completed',
        usage: { input_tokens: 200, output_tokens: 100, total_tokens: 300 },
      }),
    )!;

    expect(extractCodexUsage(event)).toEqual({
      inputTokens: 200,
      outputTokens: 100,
      cachedInputTokens: 0,
    });
  });

  it('defaults missing fields to 0', () => {
    const event = parseCodexJsonl(
      JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 42 } }),
    )!;

    expect(extractCodexUsage(event)).toEqual({
      inputTokens: 42,
      outputTokens: 0,
      cachedInputTokens: 0,
    });
  });

  it('returns zeros for non-turn.completed event', () => {
    const event = parseCodexJsonl(
      JSON.stringify({ type: 'thread.started', thread_id: 't1' }),
    )!;

    expect(extractCodexUsage(event)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
    });
  });

  it('returns zeros when usage not present', () => {
    const event = parseCodexJsonl(
      JSON.stringify({ type: 'turn.completed' }),
    )!;

    expect(extractCodexUsage(event)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
    });
  });
});

describe('isCodexTurnFailed', () => {
  it('returns true for turn.failed event', () => {
    const event = parseCodexJsonl(
      JSON.stringify({ type: 'turn.failed', error: 'Fail' }),
    )!;
    expect(isCodexTurnFailed(event)).toBe(true);
  });

  it('returns false for other events', () => {
    const event = parseCodexJsonl(
      JSON.stringify({ type: 'turn.completed' }),
    )!;
    expect(isCodexTurnFailed(event)).toBe(false);
  });
});
