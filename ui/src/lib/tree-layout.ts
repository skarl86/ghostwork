/**
 * Simple recursive tree layout algorithm for OrgChart SVG rendering.
 * Produces (x, y) positions for each node in a top-down tree.
 */

export interface TreeNode<T = unknown> {
  id: string;
  data: T;
  children: TreeNode<T>[];
}

export interface LayoutNode<T = unknown> {
  id: string;
  data: T;
  x: number;
  y: number;
  width: number;
  height: number;
  children: LayoutNode<T>[];
  parent?: LayoutNode<T>;
}

export interface LayoutOptions {
  nodeWidth: number;
  nodeHeight: number;
  horizontalGap: number;
  verticalGap: number;
}

const DEFAULT_OPTIONS: LayoutOptions = {
  nodeWidth: 180,
  nodeHeight: 80,
  horizontalGap: 24,
  verticalGap: 60,
};

/**
 * Build a tree from flat items with parent references.
 */
export function buildTree<T extends { id: string }>(
  items: T[],
  getParentId: (item: T) => string | null | undefined,
): TreeNode<T>[] {
  const map = new Map<string, TreeNode<T>>();
  const roots: TreeNode<T>[] = [];

  for (const item of items) {
    map.set(item.id, { id: item.id, data: item, children: [] });
  }

  for (const item of items) {
    const node = map.get(item.id)!;
    const parentId = getParentId(item);
    if (parentId && map.has(parentId)) {
      map.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Calculate subtree width (leaf count * nodeWidth + gaps)
 */
function subtreeWidth<T>(node: TreeNode<T>, opts: LayoutOptions): number {
  if (node.children.length === 0) {
    return opts.nodeWidth;
  }
  const childrenWidth = node.children.reduce(
    (sum, child) => sum + subtreeWidth(child, opts),
    0,
  );
  return childrenWidth + (node.children.length - 1) * opts.horizontalGap;
}

/**
 * Recursively assign positions to nodes
 */
function layoutRecursive<T>(
  node: TreeNode<T>,
  x: number,
  y: number,
  opts: LayoutOptions,
  parent?: LayoutNode<T>,
): LayoutNode<T> {
  const totalWidth = subtreeWidth(node, opts);
  const layoutNode: LayoutNode<T> = {
    id: node.id,
    data: node.data,
    x: x + totalWidth / 2 - opts.nodeWidth / 2,
    y,
    width: opts.nodeWidth,
    height: opts.nodeHeight,
    children: [],
    parent,
  };

  let childX = x;
  for (const child of node.children) {
    const childWidth = subtreeWidth(child, opts);
    const childLayout = layoutRecursive(
      child,
      childX,
      y + opts.nodeHeight + opts.verticalGap,
      opts,
      layoutNode,
    );
    layoutNode.children.push(childLayout);
    childX += childWidth + opts.horizontalGap;
  }

  return layoutNode;
}

/**
 * Layout a forest of trees, placing roots side by side
 */
export function layoutForest<T>(
  roots: TreeNode<T>[],
  options?: Partial<LayoutOptions>,
): LayoutNode<T>[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const result: LayoutNode<T>[] = [];
  let currentX = 0;

  for (const root of roots) {
    const width = subtreeWidth(root, opts);
    result.push(layoutRecursive(root, currentX, 0, opts));
    currentX += width + opts.horizontalGap * 2;
  }

  return result;
}

/**
 * Flatten a layout tree into an array of all nodes
 */
export function flattenLayout<T>(roots: LayoutNode<T>[]): LayoutNode<T>[] {
  const result: LayoutNode<T>[] = [];
  function walk(node: LayoutNode<T>) {
    result.push(node);
    for (const child of node.children) walk(child);
  }
  for (const root of roots) walk(root);
  return result;
}

/**
 * Get edges (parent→child connections) from layout
 */
export function getEdges<T>(roots: LayoutNode<T>[]): Array<{ from: LayoutNode<T>; to: LayoutNode<T> }> {
  const edges: Array<{ from: LayoutNode<T>; to: LayoutNode<T> }> = [];
  function walk(node: LayoutNode<T>) {
    for (const child of node.children) {
      edges.push({ from: node, to: child });
      walk(child);
    }
  }
  for (const root of roots) walk(root);
  return edges;
}
