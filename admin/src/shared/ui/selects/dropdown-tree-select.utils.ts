import type { TreeNodeData } from '@/shared/ui/data-display/Tree';

/**
 * Helpers backing `DropdownTreeSelect` — flat index of the tree plus pure
 * selection math (descendants, cascade toggle, tri-state check resolution).
 * Kept React-free so they can be unit-tested in isolation.
 */

export interface TreeIndex {
  /** id → node (for label / leaf lookups). */
  nodeById: Map<string, TreeNodeData>;
  /** id → parent id (null for roots). */
  parentById: Map<string, string | null>;
  /** id → direct child ids. */
  childIds: Map<string, string[]>;
}

export type CheckState = 'checked' | 'indeterminate' | 'unchecked';

export interface SelectedLabel {
  id: string;
  label: string;
}

/** Walk the tree once, building id → node / parent / children lookups. */
export function buildTreeIndex(data: TreeNodeData[]): TreeIndex {
  const nodeById = new Map<string, TreeNodeData>();
  const parentById = new Map<string, string | null>();
  const childIds = new Map<string, string[]>();

  const walk = (nodes: TreeNodeData[], parent: string | null): void => {
    for (const node of nodes) {
      nodeById.set(node.id, node);
      parentById.set(node.id, parent);
      const kids = node.children ?? [];
      childIds.set(
        node.id,
        kids.map((kid) => kid.id),
      );
      if (kids.length) walk(kids, node.id);
    }
  };

  walk(data, null);
  return { nodeById, parentById, childIds };
}

/** Every descendant id of `id` (excludes `id` itself). */
export function getDescendantIds(index: TreeIndex, id: string): string[] {
  const out: string[] = [];
  const stack = [...(index.childIds.get(id) ?? [])];
  while (stack.length) {
    const cur = stack.pop() as string;
    out.push(cur);
    const kids = index.childIds.get(cur);
    if (kids?.length) stack.push(...kids);
  }
  return out;
}

/** Resolve a node's checkbox state. Tri-state only when `cascade` is on. */
export function getCheckState(
  index: TreeIndex,
  selected: Set<string>,
  id: string,
  cascade: boolean,
): CheckState {
  if (selected.has(id)) return 'checked';
  if (!cascade) return 'unchecked';
  const hasCheckedDescendant = getDescendantIds(index, id).some((d) => selected.has(d));
  return hasCheckedDescendant ? 'indeterminate' : 'unchecked';
}

/**
 * Toggle `id`. With `cascade`: also (un)checks all descendants, then promotes
 * or demotes ancestors so a parent is checked iff all its children are.
 */
export function toggleSelection(
  index: TreeIndex,
  selected: Set<string>,
  id: string,
  checked: boolean,
  cascade: boolean,
): Set<string> {
  const next = new Set(selected);

  if (!cascade) {
    if (checked) next.add(id);
    else next.delete(id);
    return next;
  }

  for (const target of [id, ...getDescendantIds(index, id)]) {
    if (checked) next.add(target);
    else next.delete(target);
  }

  let parent = index.parentById.get(id) ?? null;
  while (parent) {
    const kids = index.childIds.get(parent) ?? [];
    const allChecked = kids.length > 0 && kids.every((kid) => next.has(kid));
    if (allChecked) next.add(parent);
    else next.delete(parent);
    parent = index.parentById.get(parent) ?? null;
  }

  return next;
}

/** Selected `{ id, label }` pairs in tree (pre-order) order — for chips/label. */
export function getSelectedLabels(data: TreeNodeData[], selected: Set<string>): SelectedLabel[] {
  const out: SelectedLabel[] = [];
  const walk = (nodes: TreeNodeData[]): void => {
    for (const node of nodes) {
      if (selected.has(node.id)) out.push({ id: node.id, label: node.name });
      if (node.children?.length) walk(node.children);
    }
  };
  walk(data);
  return out;
}
