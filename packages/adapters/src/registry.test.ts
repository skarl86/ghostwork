import { describe, it, expect } from 'vitest';
import { createAdapterRegistry } from './registry.js';
import { createMockAdapter } from './testing.js';

describe('AdapterRegistry', () => {
  it('starts empty when no built-ins provided', () => {
    const registry = createAdapterRegistry();
    expect(registry.list()).toHaveLength(0);
  });

  it('registers built-in adapters on creation', () => {
    const adapter1 = createMockAdapter();
    const adapter2 = { ...createMockAdapter(), type: 'adapter-2' };

    const registry = createAdapterRegistry([adapter1, adapter2]);

    expect(registry.list()).toHaveLength(2);
    expect(registry.get('mock')).toBe(adapter1);
    expect(registry.get('adapter-2')).toBe(adapter2);
  });

  it('register() adds a new adapter', () => {
    const registry = createAdapterRegistry();
    const adapter = createMockAdapter();

    registry.register(adapter);

    expect(registry.get('mock')).toBe(adapter);
    expect(registry.list()).toHaveLength(1);
  });

  it('register() overwrites existing adapter of same type', () => {
    const registry = createAdapterRegistry();
    const adapter1 = createMockAdapter();
    const adapter2 = createMockAdapter();

    registry.register(adapter1);
    registry.register(adapter2);

    expect(registry.get('mock')).toBe(adapter2);
    expect(registry.list()).toHaveLength(1);
  });

  it('get() returns undefined for unknown type', () => {
    const registry = createAdapterRegistry();

    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('list() returns a copy (not the internal collection)', () => {
    const adapter = createMockAdapter();
    const registry = createAdapterRegistry([adapter]);

    const list1 = registry.list();
    const list2 = registry.list();

    expect(list1).not.toBe(list2);
    expect(list1).toEqual(list2);
  });
});
