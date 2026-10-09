// The review pill under the code: move through the review, marking each file or change
// viewed on the way. Progress itself is the sidebar's ring.

import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { getState, useLens } from '../store.ts';
import { activeFile } from '../model/plans.ts';
import { fileProgress, unitProgress } from '../model/progress.ts';
import { currentUnit, summaryPage } from '../model/summaryList.ts';
import { nextFile, nextUnit, reviewedNextUnit, startReview, viewedNextFile } from '../actions/review.ts';
import { stepFile } from '../actions/tabs.ts';
import { stepSummary } from '../actions/summary.ts';
import { toggleFileViewed, toggleUnitViewed } from '../actions/viewed.ts';
import { isTestFile } from '../shared.ts';
import './ReviewPill.css';

/** What the pill offers, for the open file or change. */
type Stage = 'hidden' | 'start' | 'todo' | 'last' | 'done' | 'all';

export function ReviewPill() {
  const pill = useLens((state) => {
    const codeView = state.view === 'code';
    const page = codeView ? null : summaryPage(state);
    const progress = codeView ? fileProgress(state) : unitProgress(state);
    const file = activeFile(state);
    const shown = codeView ? !!file && !(state.hideTests && isTestFile(file.file)) : page !== 'empty';
    let stage: Stage = 'hidden';
    if (progress && progress.total > 0 && shown) {
      if (page === 'overview') stage = 'start';
      else if (progress.done === progress.total) stage = 'all';
      else if (progress.currentDone) stage = 'done';
      else stage = progress.next === null ? 'last' : 'todo';
    }
    return { codeView, stage, total: progress?.total ?? 0, atStart: !!progress?.atStart, atEnd: !!progress?.atEnd };
  });
  if (pill.stage === 'hidden') return null;

  const noun = pill.codeView ? 'file' : 'change';
  const markedWord = pill.codeView ? 'Viewed' : 'Reviewed';
  const prev = () => (pill.codeView ? stepFile(-1) : stepSummary(-1));
  const next = () => (pill.codeView ? nextFile() : nextUnit());
  const markAndNext = () => (pill.codeView ? viewedNextFile() : reviewedNextUnit());
  const undo = () => {
    const state = getState();
    if (pill.codeView) toggleFileViewed(state.active);
    else toggleUnitViewed(currentUnit(state));
  };

  if (pill.stage === 'start') {
    return (
      <div className='review-pill' id='review-pill'>
        <button className='rp-main' id='review-next' onClick={startReview}>
          Start review <ArrowRight size={13} />
        </button>
      </div>
    );
  }
  return (
    <div className='review-pill' id='review-pill'>
      <button className='rp-btn' id='review-prev' disabled={pill.atStart} onClick={prev}>
        <ArrowLeft size={13} /> Prev
      </button>
      {pill.stage === 'all' && (
        <span className='rp-main' id='review-next'>
          <Check size={13} /> All {pill.total} {noun + 's'} {markedWord.toLowerCase()}
        </span>
      )}
      {pill.stage === 'done' && (
        <span className='rp-done' id='review-next'>
          <Check size={13} /> {markedWord}
        </span>
      )}
      {(pill.stage === 'todo' || pill.stage === 'last') && (
        <button className='rp-main' id='review-next' onClick={markAndNext}>
          <Check size={13} />{' '}
          {pill.stage === 'todo' ? markedWord + ' · next ' + noun : 'Mark ' + markedWord.toLowerCase()}
        </button>
      )}
      {(pill.stage === 'done' || pill.stage === 'all') && (
        <button className='rp-btn' id='review-undo' onClick={undo}>
          Undo
        </button>
      )}
      {pill.stage === 'done' && !pill.atEnd && (
        <button className='rp-btn' onClick={next}>
          Next <ArrowRight size={13} />
        </button>
      )}
    </div>
  );
}
