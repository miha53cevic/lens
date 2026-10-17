// The agent's answers: where their cites and their change chips go.

import type { AskQuestion } from '../../cli-app/ask/session.ts';
import { getState } from '../store.ts';
import { currentUnit } from '../model/summaryList.ts';
import { unitById } from '../model/signals.ts';
import { flashCited, openSummaryUnit } from '../actions/summary.ts';
import { jumpToLine, setView } from '../actions/views.ts';
import { openFile } from '../actions/tabs.ts';

/** A cite: flash it in the open unit's code when it's there, else jump to it in the code view. */
export function askOpenCite(file: string, line: number): void {
  const state = getState();
  if (state.view === 'summary') {
    const unit = currentUnit(state);
    if (unit && unit.displayFile === file && flashCited('N' + line)) return;
  }
  const fileIndex = state.data.files.findIndex((candidate) => candidate.file === file);
  if (fileIndex >= 0) jumpToLine(fileIndex, line);
}

/** A question's change chip: back to that unit, or that file. */
export function askGoto(question: AskQuestion): void {
  const state = getState();
  if (question.unitId && unitById(state.data.summary, question.unitId)) {
    setView('summary');
    openSummaryUnit(question.unitId);
    return;
  }
  const fileIndex = state.data.files.findIndex((file) => file.file === question.file);
  if (fileIndex < 0) return;
  setView('code');
  openFile(fileIndex);
}
