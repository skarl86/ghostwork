import { describe, it, expect } from 'vitest';
import { claudeLocalAdapter } from './claude-local.js';
import { geminiLocalAdapter } from './gemini-local.js';
import { codexLocalAdapter } from './codex-local.js';
import type { AdapterModel } from '../types.js';

/**
 * Validate that a model array conforms to AdapterModel shape.
 */
function expectValidModels(models: AdapterModel[]) {
  expect(models.length).toBeGreaterThan(0);

  for (const model of models) {
    expect(typeof model.id).toBe('string');
    expect(model.id.length).toBeGreaterThan(0);
    expect(typeof model.name).toBe('string');
    expect(model.name.length).toBeGreaterThan(0);
    expect(typeof model.provider).toBe('string');
    expect(model.provider.length).toBeGreaterThan(0);
  }
}

/**
 * Validate that all model IDs in an adapter are unique.
 */
function expectUniqueIds(models: AdapterModel[]) {
  const ids = models.map((m) => m.id);
  expect(new Set(ids).size).toBe(ids.length);
}

describe('Built-in adapter model definitions', () => {
  describe('claude-local', () => {
    it('exposes a static models array', () => {
      expect(claudeLocalAdapter.models).toBeDefined();
      expectValidModels(claudeLocalAdapter.models!);
    });

    it('all models have provider "anthropic"', () => {
      for (const model of claudeLocalAdapter.models!) {
        expect(model.provider).toBe('anthropic');
      }
    });

    it('includes expected model IDs', () => {
      const ids = claudeLocalAdapter.models!.map((m) => m.id);
      expect(ids).toContain('claude-opus-4-6');
      expect(ids).toContain('claude-sonnet-4-6');
      expect(ids).toContain('claude-sonnet-4-5');
      expect(ids).toContain('claude-haiku-3-5');
    });

    it('has unique model IDs', () => {
      expectUniqueIds(claudeLocalAdapter.models!);
    });
  });

  describe('gemini-local', () => {
    it('exposes a static models array', () => {
      expect(geminiLocalAdapter.models).toBeDefined();
      expectValidModels(geminiLocalAdapter.models!);
    });

    it('all models have provider "google"', () => {
      for (const model of geminiLocalAdapter.models!) {
        expect(model.provider).toBe('google');
      }
    });

    it('includes expected model IDs', () => {
      const ids = geminiLocalAdapter.models!.map((m) => m.id);
      expect(ids).toContain('gemini-2.5-pro');
      expect(ids).toContain('gemini-2.5-flash');
      expect(ids).toContain('gemini-2.0-flash');
    });

    it('has unique model IDs', () => {
      expectUniqueIds(geminiLocalAdapter.models!);
    });
  });

  describe('codex-local', () => {
    it('exposes a static models array', () => {
      expect(codexLocalAdapter.models).toBeDefined();
      expectValidModels(codexLocalAdapter.models!);
    });

    it('all models have provider "openai"', () => {
      for (const model of codexLocalAdapter.models!) {
        expect(model.provider).toBe('openai');
      }
    });

    it('includes expected model IDs', () => {
      const ids = codexLocalAdapter.models!.map((m) => m.id);
      expect(ids).toContain('o3');
      expect(ids).toContain('o4-mini');
    });

    it('has unique model IDs', () => {
      expectUniqueIds(codexLocalAdapter.models!);
    });
  });

  describe('registry round-trip with models', () => {
    it('models are accessible via registry.get()', async () => {
      const { createAdapterRegistry } = await import('../registry.js');
      const registry = createAdapterRegistry([
        claudeLocalAdapter,
        geminiLocalAdapter,
        codexLocalAdapter,
      ]);

      const claude = registry.get('claude-local');
      expect(claude?.models).toEqual(claudeLocalAdapter.models);

      const gemini = registry.get('gemini-local');
      expect(gemini?.models).toEqual(geminiLocalAdapter.models);

      const codex = registry.get('codex-local');
      expect(codex?.models).toEqual(codexLocalAdapter.models);
    });
  });
});
