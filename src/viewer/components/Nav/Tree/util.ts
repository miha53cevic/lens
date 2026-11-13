import type { TreeDir } from '../../../model/tree.ts';
import { fileViewKey } from '../../../shared.ts';
import { changedSinceViewed } from '../../../model/viewed.ts';
import type { TreeContext } from './types.ts';

/** How far in a row of the tree at this depth starts, in px: each level is one step of the grid. */
export const indentAt = (depth: number) => 8 + depth * 12;

/** The width of a folder's chevron: a file's row has its viewed box there. */
export const TWISTIE = 16;

/**
 * Whether the reader is through a folder: 'done' when every file under it that opens is viewed,
 * 'changed' when each was viewed but some changed since (its mark is keyed by content, so it counts
 * as not viewed again), else null. Under a filter the tree shows only some of a folder: null.
 */
export function dirState(dir: TreeDir, context: TreeContext): 'done' | 'changed' | null {
  if (context.filter !== '') return null;
  let opened = 0;
  let changed = 0;
  const walk = (node: TreeDir): boolean => {
    for (const entry of node.files) {
      if (entry.index === null) continue;
      opened++;
      const key = fileViewKey(context.files[entry.index]);
      if (context.viewedFiles.has(key)) continue;
      if (!changedSinceViewed(context.viewedFiles, key)) return false;
      changed++;
    }
    return [...node.dirs.values()].every(walk);
  };
  if (!walk(dir) || opened === 0) return null;
  return changed > 0 ? 'changed' : 'done';
}
