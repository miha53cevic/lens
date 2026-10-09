/** One row of the ? help: its keys (alternatives joined by " / ") and what they do. A new key goes here and in keys.ts. */
export interface KeyHelp {
  keys: string[];
  action: string;
  /** Shown after the action, e.g. "(diff mode)" */
  note?: string;
}

export const KEYS: KeyHelp[] = [
  { keys: ['j', 'k'], action: 'next / previous file' },
  { keys: ['w'], action: 'close the active tab' },
  { keys: ['o'], action: 'keep the preview tab open (pin it)' },
  { keys: ['m'], action: 'mark the file / change as viewed' },
  { keys: ['⌘P', 'Ctrl P'], action: 'search in files' },
  { keys: ['⌥ click'], action: 'find usages of the clicked identifier' },
  { keys: ['/'], action: 'focus the file filter' },
  { keys: ['s'], action: 'toggle the file tree' },
  { keys: ['e', 'c'], action: 'expand / collapse all folds' },
  { keys: ['[', ']'], action: 'fold threshold down / up' },
  { keys: ['h'], action: 'toggle hunks only', note: '(diff mode)' },
  { keys: ['x'], action: 'toggle removed lines', note: '(diff mode)' },
  { keys: ['t'], action: 'toggle hide tests' },
  { keys: ['r'], action: 'refresh the analysis' },
  { keys: ['v'], action: 'switch Code / Summary', note: '(diff mode)' },
  { keys: ['a'], action: 'ask your agent about the open change (and your selection)' },
  { keys: ['\\'], action: 'show / hide the Ask rail' },
];

/** The keys that also act on the Summary tab's open change, as the help lists them. */
export const SUMMARY_TOOLBAR_KEYS = ['e', 'c', '[', ']', 'h', 'x', 't'];
