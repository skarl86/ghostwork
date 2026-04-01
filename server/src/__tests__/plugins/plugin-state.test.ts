/**
 * Plugin State Store tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createPluginStateStore, type PluginStateStore } from '../../services/plugin-state.js';

describe('PluginStateStore', () => {
  let store: PluginStateStore;

  beforeEach(() => {
    store = createPluginStateStore();
  });

  it('should set and get a value', async () => {
    await store.set('plugin-1', 'global', '*', 'counter', 42);
    const value = await store.get('plugin-1', 'global', '*', 'counter');
    expect(value).toBe(42);
  });

  it('should return null for non-existent key', async () => {
    const value = await store.get('plugin-1', 'global', '*', 'nonexistent');
    expect(value).toBeNull();
  });

  it('should overwrite existing value', async () => {
    await store.set('plugin-1', 'global', '*', 'counter', 1);
    await store.set('plugin-1', 'global', '*', 'counter', 2);
    const value = await store.get('plugin-1', 'global', '*', 'counter');
    expect(value).toBe(2);
  });

  it('should delete a value', async () => {
    await store.set('plugin-1', 'global', '*', 'key', 'value');
    const deleted = await store.delete('plugin-1', 'global', '*', 'key');
    expect(deleted).toBe(true);

    const value = await store.get('plugin-1', 'global', '*', 'key');
    expect(value).toBeNull();
  });

  it('should return false when deleting non-existent key', async () => {
    const deleted = await store.delete('plugin-1', 'global', '*', 'nonexistent');
    expect(deleted).toBe(false);
  });

  it('should scope by pluginId', async () => {
    await store.set('plugin-1', 'global', '*', 'key', 'from-1');
    await store.set('plugin-2', 'global', '*', 'key', 'from-2');

    const v1 = await store.get('plugin-1', 'global', '*', 'key');
    const v2 = await store.get('plugin-2', 'global', '*', 'key');
    expect(v1).toBe('from-1');
    expect(v2).toBe('from-2');
  });

  it('should scope by scopeKind and scopeId', async () => {
    await store.set('p1', 'company', 'c1', 'key', 'value-c1');
    await store.set('p1', 'company', 'c2', 'key', 'value-c2');

    expect(await store.get('p1', 'company', 'c1', 'key')).toBe('value-c1');
    expect(await store.get('p1', 'company', 'c2', 'key')).toBe('value-c2');
  });

  it('should list entries for a plugin', async () => {
    await store.set('p1', 'global', '*', 'a', 1);
    await store.set('p1', 'global', '*', 'b', 2);
    await store.set('p2', 'global', '*', 'c', 3);

    const entries = await store.list('p1');
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.key).sort()).toEqual(['a', 'b']);
  });

  it('should filter list by scopeKind', async () => {
    await store.set('p1', 'global', '*', 'a', 1);
    await store.set('p1', 'company', 'c1', 'b', 2);

    const entries = await store.list('p1', 'company');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.key).toBe('b');
  });

  it('should clear all entries for a plugin', async () => {
    await store.set('p1', 'global', '*', 'a', 1);
    await store.set('p1', 'global', '*', 'b', 2);
    await store.set('p2', 'global', '*', 'c', 3);

    await store.clear('p1');

    const p1Entries = await store.list('p1');
    expect(p1Entries).toHaveLength(0);

    // p2 should be unaffected
    const p2Entries = await store.list('p2');
    expect(p2Entries).toHaveLength(1);
  });

  it('should store complex objects', async () => {
    const complex = { nested: { array: [1, 2, 3], obj: { a: true } } };
    await store.set('p1', 'global', '*', 'complex', complex);
    const value = await store.get('p1', 'global', '*', 'complex');
    expect(value).toEqual(complex);
  });
});
