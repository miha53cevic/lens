// What an Ask question is about: the open change, and the selection in it.

import type { LensState } from '../store.ts';
import { baseName } from '../shared.ts';
import { activeFile } from './plans.ts';
import { unitLabel } from './signals.ts';
import { currentUnit, summaryPage } from './summaryList.ts';

export interface AskContext {
  key: string;
  file: string;
  unitId: string | null;
  label: string;
}

/** The open change: the Summary tab's unit, or the Code tab's file; null on the overview. */
export function askContext(state: LensState): AskContext | null {
  if (state.view === 'summary') {
    const unit = summaryPage(state) === 'unit' ? currentUnit(state) : null;
    return unit ? { key: 'u:' + unit.id, file: unit.displayFile, unitId: unit.id, label: unitLabel(unit) } : null;
  }
  const file = activeFile(state);
  // the file's name: the selection chip next to it carries the full path
  return file ? { key: 'f:' + file.file, file: file.file, unitId: null, label: baseName(file.file) } : null;
}

/** The kept selection, when it belongs to the open change. */
export function askSelection(state: LensState) {
  const context = askContext(state);
  const selection = state.ask.selection;
  return selection && context && selection.key === context.key ? selection : null;
}
