// The file tree, as the sidebar shows it, and the order j / k walk.

import type { LensState } from '../store.ts';
import { isTestFile, memo } from '../shared.ts';

export function visibleFile(state: LensState, path: string): boolean {
  return !(state.hideTests && isTestFile(path));
}

export type TreeStatus = 'added' | 'modified' | 'deleted' | 'excluded' | 'renamed';

export interface TreeFile {
  path: string;
  name: string;
  /** null: listed, but the viewer can't open it (deleted, excluded, renamed) */
  index: number | null;
  status: TreeStatus | null;
  renamedFrom?: string;
}

export interface TreeDir {
  name: string;
  dirs: Map<string, TreeDir>;
  files: TreeFile[];
}

export interface TreeModel {
  /** The tree has files to show (with hide tests applied) */
  hasTree: boolean;
  /** Some changed path is a test file: the hide tests toggle shows */
  testsPresent: boolean;
  root: TreeDir;
  /** File indices in visual tree order (dirs first, sorted, closed dirs skipped) */
  order: number[];
  filter: string;
}

const buildTree = memo(
  (data: LensState['data'], hideTests: boolean, query: string, closedDirs: ReadonlySet<string>): TreeModel => {
    const filter = query.trim().toLowerCase();
    const visible = (path: string) => !(hideTests && isTestFile(path));
    const shown = (path: string) => visible(path) && (filter === '' || path.toLowerCase().includes(filter));
    const renamed = data.renamed || [];
    const paths = [
      ...data.files.map((file) => file.file),
      ...(data.deleted || []),
      ...(data.excluded || []),
      ...renamed.map((rename) => rename.to),
    ];

    const entries: Omit<TreeFile, 'name'>[] = data.files
      .map((file, fileIndex) => ({ path: file.file, index: fileIndex, status: file.status || null }))
      .filter((entry) => shown(entry.path));
    for (const path of (data.deleted || []).filter(shown)) entries.push({ path, index: null, status: 'deleted' });
    for (const path of (data.excluded || []).filter(shown)) entries.push({ path, index: null, status: 'excluded' });
    for (const rename of renamed.filter((candidate) => shown(candidate.to))) {
      entries.push({ path: rename.to, index: null, status: 'renamed', renamedFrom: rename.from });
    }

    const root: TreeDir = { name: '', dirs: new Map(), files: [] };
    for (const entry of entries) {
      const parts = entry.path.split('/');
      const name = parts.pop()!;
      let node = root;
      for (const part of parts) {
        if (!node.dirs.has(part)) node.dirs.set(part, { name: part, dirs: new Map(), files: [] });
        node = node.dirs.get(part)!;
      }
      node.files.push({ ...entry, name });
    }
    compressChains(root);
    sortTree(root);

    const order: number[] = [];
    const walk = (node: TreeDir, path: string) => {
      for (const dir of node.dirs.values()) {
        const dirPath = path + dir.name + '/';
        if (!(filter === '' && closedDirs.has(dirPath))) walk(dir, dirPath);
      }
      for (const file of node.files) if (file.index !== null) order.push(file.index);
    };
    walk(root, '');
    return { hasTree: paths.some(visible), testsPresent: paths.some(isTestFile), root, order, filter };
  },
);

export function treeModel(state: LensState): TreeModel {
  return buildTree(state.data, state.hideTests, state.navQuery, state.closedDirs);
}

// Merge single-child directory chains ("src" > "render" > "web" → "src/render/web").
function compressChains(node: TreeDir) {
  for (const [key, firstChild] of [...node.dirs]) {
    let child = firstChild;
    while (child.dirs.size === 1 && child.files.length === 0) {
      const grandchild = [...child.dirs.values()][0];
      child = { name: child.name + '/' + grandchild.name, dirs: grandchild.dirs, files: grandchild.files };
    }
    if (child !== firstChild) {
      node.dirs.delete(key);
      node.dirs.set(child.name, child);
    }
    compressChains(child);
  }
}

function sortTree(node: TreeDir) {
  node.dirs = new Map([...node.dirs].sort(([nameA], [nameB]) => nameA.localeCompare(nameB)));
  node.files.sort((fileA, fileB) => fileA.name.localeCompare(fileB.name));
  for (const dir of node.dirs.values()) sortTree(dir);
}

/** The sidebar shows: the Summary tab's list always (unless collapsed), the tree when it has files. */
export function navShown(state: LensState): boolean {
  return !state.navCollapsed && (state.view === 'summary' || treeModel(state).hasTree);
}

/**
 * The top file of the tree as displayed. When the tree hides every file (all tests, "hide
 * tests" on) it's still the first file, so the code pane can say why nothing shows; -1 only
 * when there are no files.
 */
export function firstTreeFile(state: LensState): number {
  const { order } = treeModel(state);
  if (order.length > 0) return order[0];
  const firstVisible = state.data.files.findIndex((file) => visibleFile(state, file.file));
  return firstVisible >= 0 ? firstVisible : state.data.files.length > 0 ? 0 : -1;
}
