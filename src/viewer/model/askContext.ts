// What an Ask question is about: the open change, and the selection in it.

import type { LensState } from '../store.ts';
import { baseName, fileViewKey } from '../shared.ts';
import { activeFile } from './plans.ts';
import { type Finding, openFindings, unitLabel, unitViewKey } from './signals.ts';
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
      ? {
          // by place: a kept selection is lines, which a unit that moved has elsewhere
          key: 'u:' + unitViewKey(unit) + '@' + unit.anchor.n + ',' + unit.anchor.o,
          file: unit.displayFile,
          unitId: unit.id,
          label: unitLabel(unit),
        }
      : null;
  }
  const file = activeFile(state);
  // the file's name: the selection chip next to it carries the full path
  return file ? { key: 'f:' + fileViewKey(file), file: file.file, unitId: null, label: baseName(file.file) } : null;
}

/** The open unit's findings the reader hasn't dismissed: they go along with a question about it. */
export function askFindings(state: LensState): Finding[] {
  const unit = state.view === 'summary' && summaryPage(state) === 'unit' ? currentUnit(state) : null;
  return unit ? openFindings(state.concernMarks, unit) : [];
}

/** The kept selection, when it belongs to the open change. */
export function askSelection(state: LensState) {
  const context = askContext(state);
  const selection = state.ask.selection;
  return selection && context && selection.key === context.key ? selection : null;
}
