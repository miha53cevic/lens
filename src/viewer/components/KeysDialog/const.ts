/** One row of the ? help: what it does, then its keys (each a keycap combo). A new key goes here and in keys.ts. */
export interface KeyHelp {
  action: string;
  keys: string[];
  /** A few words after the action, fainter */
  hint?: string;
  /** Works only on a diff: tagged "diff" */
  diff?: boolean;
  /** Shown only with the Plan tab on */
  plan?: boolean;
}

/** Where a group's keys work: everywhere, or in one view (the store's View, spelled out: test/rules.test.ts reads this file without the viewer) */
export type KeyScope = 'global' | 'code' | 'summary' | 'plan';

export interface KeyGroup {
  id: string;
  label: string;
  scope: KeyScope;
  /** Every key in it works only on a diff: the group is tagged once, not each row */
  diff?: boolean;
  keys: KeyHelp[];
}

/** The ? help's groups: the keys that work everywhere, then each view's own (the help puts the reader's view first). */
export const KEY_GROUPS: KeyGroup[] = [
  {
    id: 'find',
    label: 'Find',
    scope: 'global',
    keys: [
      { action: 'Search in files', keys: ['⌘P', 'Ctrl P'] },
      { action: 'Go to file', keys: ['⌘⇧P', 'Ctrl ⇧P'] },
      { action: 'Find usages', keys: ['⌥ click'], hint: 'of the clicked name' },
      { action: 'Next note', keys: ['N'], hint: 'on into the next file or change' },
    ],
  },
  {
    id: 'views',
    label: 'Views & panels',
    scope: 'global',
    keys: [
      { action: 'Code ↔ Summary', keys: ['v'], diff: true },
      { action: 'Plan ↔ Code', keys: ['p'], plan: true },
      { action: 'Sidebar', keys: ['s'] },
      { action: 'Ask rail', keys: ['\\'] },
    ],
  },
  {
    id: 'code-display',
    label: 'Code display',
    scope: 'global',
    keys: [
      { action: 'Expand all folds', keys: ['e'], hint: 'of the open file or change' },
      { action: 'Collapse all folds', keys: ['c'] },
      { action: 'Hide tests', keys: ['t'] },
    ],
  },
  {
    id: 'diff-display',
    label: 'Diff display',
    scope: 'global',
    diff: true,
    keys: [
      { action: 'Hunks only', keys: ['h'] },
      { action: 'Removed lines', keys: ['x'] },
      { action: 'Word diff', keys: ['d'] },
      { action: 'Side by side', keys: ['l'] },
    ],
  },
  {
    id: 'actions',
    label: 'Actions',
    scope: 'global',
    keys: [
      { action: 'Ask your agent', keys: ['a'], hint: 'about the change and your selection' },
      { action: 'Refresh', keys: ['r'] },
      { action: 'Settings', keys: [','] },
      { action: 'Shortcuts', keys: ['?'] },
      { action: 'Close · clear', keys: ['Esc'], hint: 'a dialog, the filter, the Ask input' },
    ],
  },
  {
    id: 'code',
    label: 'Code view',
    scope: 'code',
    keys: [
      { action: 'Next / previous file', keys: ['j', 'k'] },
      { action: 'Close tab', keys: ['w'] },
      { action: 'Keep the preview tab', keys: ['o'] },
      { action: 'Mark viewed', keys: ['m'] },
      { action: 'Filter files', keys: ['/'] },
    ],
  },
  {
    id: 'summary',
    label: 'Summary',
    scope: 'summary',
    keys: [
      { action: 'Overview', keys: ['g'] },
      { action: 'Next / previous change', keys: ['j', 'k'], hint: 'into a folded flow too' },
      { action: 'Open in code', keys: ['o'] },
      { action: 'Mark viewed', keys: ['m'], hint: 'the inbox: read, and on' },
      { action: 'Filter changes', keys: ['/'] },
    ],
  },
  {
    id: 'plan',
    label: 'Plan',
    scope: 'plan',
    keys: [
      { action: 'New plan', keys: ['g'] },
      { action: 'Full screen', keys: ['f'], hint: 'Esc leaves it' },
      { action: 'Filter plans', keys: ['/'] },
    ],
  },
];
