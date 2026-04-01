import { describe, it, expect } from 'vitest';
import { buildTree, layoutForest, flattenLayout, getEdges } from '../lib/tree-layout';

interface TestItem {
  id: string;
  parentId: string | null;
  name: string;
}

describe('buildTree', () => {
  it('builds roots from items without parents', () => {
    const items: TestItem[] = [
      { id: 'a', parentId: null, name: 'A' },
      { id: 'b', parentId: null, name: 'B' },
    ];
    const roots = buildTree(items, (i) => i.parentId);
    expect(roots).toHaveLength(2);
    expect(roots[0]?.id).toBe('a');
    expect(roots[1]?.id).toBe('b');
  });

  it('nests children under parents', () => {
    const items: TestItem[] = [
      { id: 'root', parentId: null, name: 'Root' },
      { id: 'child1', parentId: 'root', name: 'Child 1' },
      { id: 'child2', parentId: 'root', name: 'Child 2' },
      { id: 'grandchild', parentId: 'child1', name: 'Grandchild' },
    ];
    const roots = buildTree(items, (i) => i.parentId);
    expect(roots).toHaveLength(1);
    expect(roots[0]?.children).toHaveLength(2);
    expect(roots[0]?.children[0]?.children).toHaveLength(1);
    expect(roots[0]?.children[0]?.children[0]?.id).toBe('grandchild');
  });

  it('treats orphans as roots', () => {
    const items: TestItem[] = [
      { id: 'a', parentId: 'nonexistent', name: 'A' },
    ];
    const roots = buildTree(items, (i) => i.parentId);
    expect(roots).toHaveLength(1);
    expect(roots[0]?.id).toBe('a');
  });
});

describe('layoutForest', () => {
  it('assigns positions to single root', () => {
    const items: TestItem[] = [
      { id: 'root', parentId: null, name: 'Root' },
    ];
    const trees = buildTree(items, (i) => i.parentId);
    const layout = layoutForest(trees);
    expect(layout).toHaveLength(1);
    expect(layout[0]?.x).toBe(0);
    expect(layout[0]?.y).toBe(0);
  });

  it('positions children below parent', () => {
    const items: TestItem[] = [
      { id: 'root', parentId: null, name: 'Root' },
      { id: 'child', parentId: 'root', name: 'Child' },
    ];
    const trees = buildTree(items, (i) => i.parentId);
    const layout = layoutForest(trees);
    const flat = flattenLayout(layout);
    expect(flat).toHaveLength(2);
    const root = flat.find((n) => n.id === 'root');
    const child = flat.find((n) => n.id === 'child');
    expect(child!.y).toBeGreaterThan(root!.y);
  });

  it('produces edges', () => {
    const items: TestItem[] = [
      { id: 'root', parentId: null, name: 'Root' },
      { id: 'c1', parentId: 'root', name: 'C1' },
      { id: 'c2', parentId: 'root', name: 'C2' },
    ];
    const trees = buildTree(items, (i) => i.parentId);
    const layout = layoutForest(trees);
    const edges = getEdges(layout);
    expect(edges).toHaveLength(2);
    expect(edges[0]?.from.id).toBe('root');
  });
});

describe('flattenLayout', () => {
  it('returns all nodes in flat array', () => {
    const items: TestItem[] = [
      { id: 'root', parentId: null, name: 'Root' },
      { id: 'a', parentId: 'root', name: 'A' },
      { id: 'b', parentId: 'root', name: 'B' },
      { id: 'c', parentId: 'a', name: 'C' },
    ];
    const trees = buildTree(items, (i) => i.parentId);
    const layout = layoutForest(trees);
    const flat = flattenLayout(layout);
    expect(flat).toHaveLength(4);
  });
});
