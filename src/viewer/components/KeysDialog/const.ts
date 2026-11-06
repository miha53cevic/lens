/** One row of the ? help: its keys (alternatives joined by " / ") and what they do. A new key goes here and in keys.ts. */
export interface KeyHelp {
  keys: string[];
  action: string;
  /** Shown after the action, e.g. "(diff mode)" */
  note?: string;
}

export type KeyTab = 'global' | 'code' | 'summary' | 'plan';

/** The ? help's tabs: keys that work the same in both views, then each view's own. */
export const KEY_TABS: { id: KeyTab; label: string; keys: KeyHelp[] }[] = [
  {
    id: 'global',
    label: 'Global',
    keys: [
      { keys: ['⌘P', 'Ctrl P'], action: 'search in files' },
      { keys: ['⌘⇧P', 'Ctrl ⇧P'], action: 'find a file by its path' },
      { keys: ['⌥ click'], action: 'find usages of the clicked identifier' },
      { keys: ['v'], action: 'switch Code / Summary', note: '(diff mode)' },
      { keys: ['p'], action: 'switch to the Plan tab · back to Code', note: '(Plan tab on)' },
      { keys: ['s'], action: 'toggle the sidebar' },
      { keys: ['e', 'c'], action: 'expand / collapse all folds of the open file or change' },
      { keys: ['h'], action: 'toggle hunks only', note: '(diff mode)' },
      { keys: ['x'], action: 'toggle removed lines', note: '(diff mode)' },
      { keys: ['d'], action: 'toggle word diff', note: '(diff mode)' },
      { keys: ['l'], action: 'toggle side by side', note: '(diff mode)' },
      { keys: ['t'], action: 'toggle hide tests' },
      { keys: ['r'], action: 'refresh the analysis' },
      { keys: ['a'], action: 'ask your agent about the open change (and your selection) · close the Ask rail' },
      { keys: ['N'], action: 'jump to your next note, on into the next file or change with one' },
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
    ],
  },
  {
    id: 'summary',
    label: 'Summary',
    keys: [
      { keys: ['g'], action: 'the overview' },
      { keys: ['j', 'k'], action: 'next / previous change (the inbox: into a folded flow too)' },
      { keys: ['o'], action: 'open the change in the code view' },
      { keys: ['m'], action: 'mark the change as viewed (the inbox: read, and on to the next)' },
      { keys: ['/'], action: 'filter the changes' },
    ],
  },
  {
    id: 'plan',
    label: 'Plan',
    keys: [
      { keys: ['g'], action: 'New plan' },
      { keys: ['f'], action: 'the plan full screen (Esc leaves it)' },
      { keys: ['/'], action: 'filter the plans' },
    ],
  },
];
