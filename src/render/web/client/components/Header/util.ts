import type { CSSProperties } from 'react';
import type { LensState } from '../../store.ts';
import { activeFile, filePlan, foldedCount, planRegions, unitPlan } from '../../model/plans.ts';
import { currentUnit, summaryPage } from '../../model/summaryList.ts';
import { isDiffMode, listedOnlyCount } from '../../shared.ts';

/** A control the state hides. */
export function hiddenStyle(hidden: boolean): CSSProperties | undefined {
  return hidden ? { display: 'none' } : undefined;
}

/** "3 files changed · src/a.ts — 120 lines, 14 folded (−12%) · 80 unchanged hidden" */
export function statsText(state: LensState): string {
  const file = activeFile(state);
  if (!file) return '';
  const changedFiles = isDiffMode(state.data) ? state.data.files.length + listedOnlyCount(state.data) : 0;
  const folded = foldedCount(file, state.threshold);
  const percent = file.lineCount ? Math.round((folded / file.lineCount) * 100) : 0;
  const hiddenLines = filePlan(state, file).hidden;
  return (
    (changedFiles > 0 ? changedFiles + (changedFiles === 1 ? ' file' : ' files') + ' changed · ' : '') +
    file.file +
    ' — ' +
    file.lineCount +
    ' lines, ' +
    folded +
    ' folded (−' +
    percent +
    '%)' +
    (hiddenLines > 0 ? ' · ' + hiddenLines + ' unchanged hidden' : '')
  );
}

/** The categories that fold in the code on screen: the file's, or the open unit's code's. */
export function chipCategories(state: LensState): string[] {
  if (state.view === 'code') {
    const file = activeFile(state);
    return file ? [...new Set(file.regions.map((region) => region.category))] : [];
  }
  const unit = summaryPage(state) === 'unit' ? currentUnit(state) : null;
  return unit ? [...new Set(planRegions(unitPlan(state, unit).items).map((region) => region.category))] : [];
}
