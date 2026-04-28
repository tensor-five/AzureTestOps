export type TestSuiteNode = {
  id: number;
  name: string;
  parentSuiteId: number | null;
  /** Slash-separated path from the root suite, e.g. "Plan > Sprint 12 > API". */
  path: string;
  children: TestSuiteNode[];
};

export type TestSuiteFlatEntry = {
  id: number;
  name: string;
  parentSuiteId: number | null;
  path: string;
  depth: number;
};

/**
 * Walks the tree depth-first and returns a flat list with depth + path so
 * call sites can render hierarchies without re-walking the tree.
 */
export function flattenSuiteTree(root: TestSuiteNode): TestSuiteFlatEntry[] {
  const flat: TestSuiteFlatEntry[] = [];

  function walk(node: TestSuiteNode, depth: number): void {
    flat.push({
      id: node.id,
      name: node.name,
      parentSuiteId: node.parentSuiteId,
      path: node.path,
      depth
    });
    for (const child of node.children) {
      walk(child, depth + 1);
    }
  }

  walk(root, 0);
  return flat;
}

/** Looks up a suite node by id. Returns null when the id is not in the tree. */
export function findSuiteById(root: TestSuiteNode, id: number): TestSuiteNode | null {
  if (root.id === id) {
    return root;
  }
  for (const child of root.children) {
    const found = findSuiteById(child, id);
    if (found) {
      return found;
    }
  }
  return null;
}

/** Returns all suite ids in the tree (root + descendants). */
export function collectSuiteIds(root: TestSuiteNode): number[] {
  const ids: number[] = [];
  function walk(node: TestSuiteNode): void {
    ids.push(node.id);
    for (const child of node.children) {
      walk(child);
    }
  }
  walk(root);
  return ids;
}
