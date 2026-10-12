import type { TreeStatus } from '../../model/tree.ts';

/** A tree row's tooltip: what its status letter means. */
export const STATUS_TITLE: Record<TreeStatus, string> = {
  added: 'added',
  modified: 'modified',
  deleted: 'deleted in this diff',
  excluded: 'changed, but excluded from analysis (exclude patterns in config)',
  renamed: 'renamed, content unchanged',
};

/** What a binary file's row adds to its status: why it can't be opened. */
export const BINARY_TITLE = 'a binary file: nothing to show';
