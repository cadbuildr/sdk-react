import type { PartInstancePayload } from "./useCadbuildrRender";

/**
 * Lightweight assembly-tree model built from the kernel's `partInstances`.
 *
 * Each instance carries an assembly `path` such as
 * `"pcb/components__689a/led__d4c0"`. We split those paths into a tree of
 * {@link PartsTreeNode}s so the SDK can render a show/hide tree (à la the full
 * CADbuildr CAD viewer) without pulling in the whole viewer package.
 *
 * A node's `id` is its cumulative path; an instance is visible iff none of its
 * ancestor node ids (or its own) is in the hidden set. Display names strip the
 * `__<hash>` suffix the kernel appends for instance identity.
 */

export type PartsTreeNodeKind = "assembly" | "part";

export interface PartsTreeNode {
  /** Cumulative path, e.g. `"pcb/components__689a"`. Unique within a tree. */
  id: string;
  /** Human-readable label (the `__<hash>` suffix removed). */
  name: string;
  kind: PartsTreeNodeKind;
  depth: number;
  children: PartsTreeNode[];
}

function displayName(segment: string): string {
  return segment.split("__")[0] || segment;
}

/**
 * Build a forest of {@link PartsTreeNode}s from the kernel part instances.
 * Returns the top-level roots (usually a single board assembly).
 */
export function buildPartsTree(instances: PartInstancePayload[] | undefined): PartsTreeNode[] {
  const roots: PartsTreeNode[] = [];
  const index = new Map<string, PartsTreeNode>();

  for (const instance of instances ?? []) {
    const rawPath = instance.path ?? instance.name ?? instance.hash;
    const segments = rawPath.split("/").filter(Boolean);
    if (segments.length === 0) continue;

    let parentChildren = roots;
    let pathSoFar = "";
    let depth = 0;
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      pathSoFar = pathSoFar ? `${pathSoFar}/${segment}` : segment;
      const isLeaf = i === segments.length - 1;
      let node = index.get(pathSoFar);
      if (!node) {
        node = {
          id: pathSoFar,
          name: isLeaf && instance.name ? instance.name : displayName(segment),
          kind: isLeaf ? "part" : "assembly",
          depth,
          children: [],
        };
        index.set(pathSoFar, node);
        parentChildren.push(node);
      } else if (isLeaf) {
        // A path that is both an interior node and a leaf: keep it a container.
        node.kind = node.children.length > 0 ? "assembly" : "part";
      }
      parentChildren = node.children;
      depth += 1;
    }
  }

  return roots;
}

/** Walk every node in the forest, depth-first. */
export function walkPartsTree(
  roots: PartsTreeNode[],
  visit: (node: PartsTreeNode) => void,
): void {
  const stack = [...roots];
  while (stack.length) {
    const node = stack.shift()!;
    visit(node);
    stack.unshift(...node.children);
  }
}

/** Collect the ids of every node whose display name is in `names`. */
export function collectNodeIdsByName(
  roots: PartsTreeNode[],
  names: readonly string[],
): string[] {
  const wanted = new Set(names);
  const ids: string[] = [];
  walkPartsTree(roots, (node) => {
    if (wanted.has(node.name)) ids.push(node.id);
  });
  return ids;
}

/**
 * Is a part instance (identified by its assembly `path`) visible given the set
 * of hidden node ids? Hidden if the instance itself or any ancestor is hidden.
 */
export function isInstanceVisible(
  path: string | undefined,
  hidden: ReadonlySet<string>,
): boolean {
  if (hidden.size === 0) return true;
  if (!path) return true;
  const segments = path.split("/").filter(Boolean);
  let prefix = "";
  for (const segment of segments) {
    prefix = prefix ? `${prefix}/${segment}` : segment;
    if (hidden.has(prefix)) return false;
  }
  return true;
}

/** Is `node` (or an ancestor) hidden? Used to render the tree's eye state. */
export function isNodeVisible(
  node: PartsTreeNode,
  hidden: ReadonlySet<string>,
): boolean {
  return isInstanceVisible(node.id, hidden);
}
