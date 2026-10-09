import type { TreeStatus } from '../../model/tree.ts';

export const STATUS_LETTER: Record<TreeStatus, string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  excluded: '⊘',
  renamed: 'R',
};

export const STATUS_TITLE: Record<TreeStatus, string> = {
  added: 'added',
  modified: 'modified',
  deleted: 'deleted in this diff',
  excluded: 'changed, but excluded from analysis (exclude patterns in config)',
  renamed: 'renamed, content unchanged',
};
