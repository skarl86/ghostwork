import { describe, it, expect } from 'vitest';
import {
  parseGeminiJsonl,
  extractGeminiUsage,
  extractGeminiCostUsd,
  extractGeminiModel,
  detectGeminiAuthRequired,
} from './gemini-jsonl.js';

describe('parseGeminiJsonl', () => {
  it('parses system event', () => {
    const line = JSON.stringify({ type: 'system', message: 'initialized' });
    const event = parseGeminiJsonl(line);

    expect(event).not.toBeNull();
    expect(event!.type).toBe('system');
  });

  it('parses assistant event', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'Hello!' }],
      },
    });
    const event = parseGeminiJsonl(line);

    expect(event).not.toBeNull();
    expect(event!.type).toBe('assistant');
  });

  it('parses text event', () => {
    const line = JSON.stringify({ type: 'text', text: 'Some output' });
    const event = parseGeminiJsonl(line);

    expect(event).not.toBeNull();
    expect(event!.type).toBe('text');
  });

  it('parses result event with usage', () => {
    const line = JSON.stringify({
      type: 'result',
      usage: { input_tokens: 100, output_tokens: 50 },
      model: 'gemini-2.5-pro',
      cost_usd: '0.002',
    });
    const event = parseGeminiJsonl(line);

    expect(event).not.toBeNull();
    expect(event!.type).toBe('result');
  });

  it('parses error event', () => {
    const line = JSON.stringify({ type: 'error', error: 'Something went wrong' });
    const event = parseGeminiJsonl(line);

    expect(event).not.toBeNull();
    expect(event!.type).toBe('error');
  });

  it('returns null for empty string', () => {
    expect(parseGeminiJsonl('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(parseGeminiJsonl('   ')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseGeminiJsonl('not json')).toBeNull();
    expect(parseGeminiJsonl('{broken')).toBeNull();
  });

  it('returns null for non-object JSON', () => {
    expect(parseGeminiJsonl('"string"')).toBeNull();
    expect(parseGeminiJsonl('42')).toBeNull();
    expect(parseGeminiJsonl('null')).toBeNull();
  });

  it('returns null for unknown event type', () => {
    const line = JSON.stringify({ type: 'unknown_event' });
    expect(parseGeminiJsonl(line)).toBeNull();
  });

  it('handles line with leading/trailing whitespace', () => {
    const line = `  ${JSON.stringify({ type: 'system', message: 'ok' })}  `;
    const event = parseGeminiJsonl(line);

    expect(event).not.toBeNull();
    expect(event!.type).toBe('system');
  });
});

describe('extractGeminiUsage', () => {
  it('extracts full usage from result', () => {
    const event = parseGeminiJsonl(
      JSON.stringify({
        type: 'result',
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    )!;

    expect(extractGeminiUsage(event)).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      cachedInputTokens: 0,
    });
  });

  it('defaults missing fields to 0', () => {
    const event = parseGeminiJsonl(
      JSON.stringify({ type: 'result', usage: { input_tokens: 42 } }),
    )!;

    expect(extractGeminiUsage(event)).toEqual({
      inputTokens: 42,
      outputTokens: 0,
      cachedInputTokens: 0,
    });
  });

  it('returns zeros for non-result event', () => {
    const event = parseGeminiJsonl(
      JSON.stringify({ type: 'system', message: 'ok' }),
    )!;

    expect(extractGeminiUsage(event)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
    });
  });

  it('returns zeros when usage not present', () => {
    const event = parseGeminiJsonl(
      JSON.stringify({ type: 'result' }),
    )!;

    expect(extractGeminiUsage(event)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
    });
  });
});

describe('extractGeminiCostUsd', () => {
  it('extracts string cost from result', () => {
    const event = parseGeminiJsonl(
      JSON.stringify({ type: 'result', cost_usd: '0.0042' }),
    )!;
    expect(extractGeminiCostUsd(event)).toBe('0.0042');
  });

  it('converts numeric cost to string', () => {
    const event = parseGeminiJsonl(
      JSON.stringify({ type: 'result', cost_usd: 0.005 }),
    )!;
    expect(extractGeminiCostUsd(event)).toBe('0.005');
  });

  it('returns null for non-result event', () => {
    const event = parseGeminiJsonl(
      JSON.stringify({ type: 'system', message: 'ok' }),
    )!;
    expect(extractGeminiCostUsd(event)).toBeNull();
  });

  it('returns null when cost not present', () => {
    const event = parseGeminiJsonl(
      JSON.stringify({ type: 'result' }),
    )!;
    expect(extractGeminiCostUsd(event)).toBeNull();
  });
});

describe('extractGeminiModel', () => {
  it('extracts model from result', () => {
    const event = parseGeminiJsonl(
      JSON.stringify({ type: 'result', model: 'gemini-2.5-pro' }),
    )!;
    expect(extractGeminiModel(event)).toBe('gemini-2.5-pro');
  });

  it('returns null for non-result event', () => {
    const event = parseGeminiJsonl(
      JSON.stringify({ type: 'text', text: 'hi' }),
    )!;
    expect(extractGeminiModel(event)).toBeNull();
  });

  it('returns null when model not present', () => {
    const event = parseGeminiJsonl(
      JSON.stringify({ type: 'result' }),
    )!;
    expect(extractGeminiModel(event)).toBeNull();
  });
});

describe('detectGeminiAuthRequired', () => {
  it('detects "authentication required"', () => {
    expect(detectGeminiAuthRequired('Authentication required')).toBe(true);
  });

  it('detects "not authenticated"', () => {
    expect(detectGeminiAuthRequired('User is not authenticated')).toBe(true);
  });

  it('detects "login required"', () => {
    expect(detectGeminiAuthRequired('Login required')).toBe(true);
  });

  it('detects "please log in"', () => {
    expect(detectGeminiAuthRequired('Please log in to continue')).toBe(true);
  });

  it('detects "invalid credentials"', () => {
    expect(detectGeminiAuthRequired('Error: invalid credentials')).toBe(true);
  });

  it('detects "gcloud auth" instructions', () => {
    expect(detectGeminiAuthRequired('Run gcloud auth login')).toBe(true);
  });

  it('returns false for normal output', () => {
    expect(detectGeminiAuthRequired('Task completed')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(detectGeminiAuthRequired('')).toBe(false);
  });
});
