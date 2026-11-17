import type { SettingsPage } from '../../store.ts';

export const LEVELS = [
  { value: -1, label: 'off', tip: 'nothing folds' },
  { value: 0, label: '0' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
];

/** The rail's view pages, in order; Config sits apart at its foot. */
export const VIEW_PAGES: { id: Exclude<SettingsPage, 'config'>; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'code', label: 'Code' },
  { id: 'summary', label: 'Summary' },
  { id: 'flags', label: 'Feature flags' },
  { id: 'debug', label: 'Debug' },
];

/**
 * What each built-in category folds, in words, for the Config page (the rules: cli-app/classify/typescript.ts).
 * A category only call patterns make has none: its patterns say it.
 */
export const CATEGORY_WHAT: Record<string, string> = {
  import: 'Import statements',
  comment: 'Comments, except those holding a marker',
  guard: 'An if with no else that only returns, throws, continues or breaks (a log line allowed)',
  logging: 'Calls that only log',
  telemetry: 'Calls that only record metrics',
  'error-boilerplate': 'A catch body that only logs or rethrows its error',
  accessor: 'Getters and setters that only return or store a value',
  barrel: 'A file of nothing but imports and re-exports',
  data: 'Constants and enums made only of literals',
};

/** How many of a long list the Config page shows before "+N more". */
export const LIST_SHOWN = 5;
