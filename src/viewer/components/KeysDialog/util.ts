import type { View } from '../../store.ts';
import type { KeyGroup, KeyHelp } from './const.ts';

export interface KeysShown {
  /** The groups to draw, the reader's view first; each with only the rows that match */
  groups: KeyGroup[];
  /** The group of the view the reader is in, or null when that view has no keys of its own here */
  here: string | null;
}

/**
 * A row matches when the filter is in its words, or names one of its keys: "j" finds j, not every
 * action with a j in it. Capitals count, as N and n are different keys.
 */
function matches(row: KeyHelp, group: KeyGroup, query: string): boolean {
  if (query === '') return true;
  const words = [row.action, row.hint ?? '', group.label].join(' ').toLowerCase();
  if (query.length > 1 && words.includes(query.toLowerCase())) return true;
  return row.keys.some((combo) => combo === query || combo.toLowerCase().split(/\s+/).includes(query.toLowerCase()));
}

/**
 * What the ? help shows: the groups this review has (Summary with a summary, Plan with its tab on),
 * the reader's view first, cut down to what the filter matches.
 */
export function keysShown(
  all: KeyGroup[],
  { view, hasSummary, planTab, query }: { view: View; hasSummary: boolean; planTab: boolean; query: string },
): KeysShown {
  const present = all.filter(
    (group) => (group.scope !== 'summary' || hasSummary) && (group.scope !== 'plan' || planTab),
  );
  const here = present.find((group) => group.scope === view)?.id ?? null;
  const ordered = [...present.filter((group) => group.id === here), ...present.filter((group) => group.id !== here)];
  const wanted = query.trim();
  const groups = ordered
    .map((group) => ({
      ...group,
      keys: group.keys.filter((row) => (planTab || !row.plan) && matches(row, group, wanted)),
    }))
    .filter((group) => group.keys.length > 0);
  return { groups, here };
}
