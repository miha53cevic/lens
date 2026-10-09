/** One row of the ? help: its keys (alternatives joined by " / ") and what they do. A new key goes here and in keys.ts. */
export interface KeyHelp {
  keys: string[];
  action: string;
  /** Shown after the action, e.g. "(diff mode)" */
  note?: string;
}

export type KeyTab = 'global' | 'code' | 'summary';

/** The ? help's tabs: keys that work the same in both views, then each view's own. */
export const KEY_TABS: { id: KeyTab; label: string; keys: KeyHelp[] }[] = [
  {
    id: 'global',
    label: 'Global',
    keys: [
      { keys: ['⌘P', 'Ctrl P'], action: 'search in files' },
      { keys: ['v'], action: 'switch Code / Summary', note: '(diff mode)' },
      { keys: ['s'], action: 'toggle the sidebar' },
      { keys: ['e', 'c'], action: 'expand / collapse all folds of the open file or change' },
      { keys: ['[', ']'], action: 'fold threshold down / up' },
      { keys: ['h'], action: 'toggle hunks only', note: '(diff mode)' },
      { keys: ['x'], action: 'toggle removed lines', note: '(diff mode)' },
      { keys: ['t'], action: 'toggle hide tests' },
      { keys: ['r'], action: 'refresh the analysis' },
      { keys: ['a'], action: 'ask your agent about the open change (and your selection)' },
      { keys: ['\\'], action: 'show / hide the Ask rail' },
      { keys: ['?'], action: 'this help' },
      { keys: ['Esc'], action: 'close dialogs · clear the filter · leave the Ask input' },
    ],
  },
  {
    id: 'code',
    label: 'Code',
    keys: [
      { keys: ['j', 'k'], action: 'next / previous file' },
      { keys: ['w'], action: 'close the active tab' },
      { keys: ['o'], action: 'keep the preview tab open (pin it)' },
      { keys: ['m'], action: 'mark the file as viewed' },
      { keys: ['/'], action: 'focus the file filter' },
      { keys: ['⌥ click'], action: 'find usages of the clicked identifier' },
    ],
  },
  {
    id: 'summary',
    label: 'Summary',
    keys: [
      { keys: ['g'], action: 'the overview' },
      { keys: ['j', 'k'], action: 'next / previous change' },
      { keys: ['o'], action: 'open the change in the code view' },
      { keys: ['m'], action: 'mark the change as viewed' },
      { keys: ['/'], action: 'filter the changes' },
    ],
  },
];
