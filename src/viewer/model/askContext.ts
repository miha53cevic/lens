// What an Ask question is about: the open change, and the selection in it.

import type { Concern } from '../../cli-app/summary/store.ts';
import type { LensState } from '../store.ts';
import { baseName, fileViewKey } from '../shared.ts';
import { activeFile } from './plans.ts';
import { openConcerns, unitLabel, unitViewKey } from './signals.ts';
import { currentUnit, summaryPage } from './summaryList.ts';

export interface AskContext {
  /** The change and its code: a selection kept in it goes when a refresh brings other code */
  key: string;
  file: string;
  unitId: string | null;
  label: string;
}

/** The open change: the Summary tab's unit, or the Code tab's file; null on the overview. */
export function askContext(state: LensState): AskContext | null {
  if (state.view === 'summary') {
    const unit = summaryPage(state) === 'unit' ? currentUnit(state) : null;
    return unit
      ? { key: 'u:' + unitViewKey(unit), file: unit.displayFile, unitId: unit.id, label: unitLabel(unit) }
      : null;
  }
  const file = activeFile(state);
  // the file's name: the selection chip next to it carries the full path
  return file ? { key: 'f:' + fileViewKey(file), file: file.file, unitId: null, label: baseName(file.file) } : null;
}

/** The kept selection, when it belongs to the open change. */
/** The open unit's concerns the reader hasn't dismissed: they go along with a question about it. */
export function askConcerns(state: LensState): Concern[] {
  const unit = state.view === 'summary' && summaryPage(state) === 'unit' ? currentUnit(state) : null;
  return unit ? openConcerns(state.concernMarks, unit) : [];
}

export function askSelection(state: LensState) {
  const context = askContext(state);
  const selection = state.ask.selection;
  return selection && context && selection.key === context.key ? selection : null;
}
