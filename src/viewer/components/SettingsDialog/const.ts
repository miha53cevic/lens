import type { SettingsPage } from '../../store.ts';

export const LEVELS = [
  { value: -1, label: 'off', title: 'nothing folds' },
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
