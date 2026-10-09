// Viewed marks: keyed by content, so what changes after it was ticked comes back unticked.

import { getState, toggled, update, VIEWED_CAP, VIEWED_PREF } from '../store.ts';
import { fileViewKey, type ViewFile, writePref } from '../shared.ts';
import { type Unit, unitViewKey } from '../model/signals.ts';

function saveViewed(prefKey: string, viewed: ReadonlySet<string>) {
  // Sets keep insertion order: the oldest marks drop first
  writePref(prefKey, JSON.stringify([...viewed].slice(-VIEWED_CAP)));
}

export function toggleFileViewed(fileIndex: number): void {
  const state = getState();
  const file: ViewFile | undefined = state.data.files[fileIndex];
  if (!file) return;
  const viewedFiles = toggled(state.viewedFiles, fileViewKey(file));
  saveViewed(VIEWED_PREF.files, viewedFiles);
  update({ viewedFiles });
}

export function toggleUnitViewed(unit: Unit | null): void {
  if (!unit) return;
  const viewedUnits = toggled(getState().viewedUnits, unitViewKey(unit));
  saveViewed(VIEWED_PREF.units, viewedUnits);
  update({ viewedUnits });
}
