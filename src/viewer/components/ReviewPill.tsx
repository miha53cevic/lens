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
import { toggleFileViewed, toggleUnitViewed } from '../actions/prefs.ts';
import { isTestFile } from '../shared.ts';
import { Button } from '../../ui/Button.tsx';
import './ReviewPill.css';

/** What the pill offers, for the open file or change. */
type Stage = 'hidden' | 'start' | 'todo' | 'last' | 'done' | 'all';

export function ReviewPill() {
  const pill = useLens((state) => {
    const codeView = state.view === 'code';
    const page = codeView ? null : summaryPage(state);
    const progress = codeView ? fileProgress(state) : unitProgress(state);
    const file = activeFile(state);
    const shown = codeView ? !!file && !(state.hideTests && isTestFile(file.file)) : true;
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
        <Button variant='primary' size='sm' id='review-next' onClick={startReview}>
          Start review <ArrowRight size={13} />
        </Button>
      </div>
    );
  }
  return (
    <div className='review-pill' id='review-pill'>
      <Button variant='ghost' size='sm' id='review-prev' disabled={pill.atStart} onClick={prev}>
        <ArrowLeft size={13} /> Prev
      </Button>
      {pill.stage === 'all' && (
        <span className='rp-all' id='review-next'>
          <Check size={13} /> All {pill.total} {noun + 's'} {markedWord.toLowerCase()}
        </span>
      )}
      {pill.stage === 'done' && (
        <span className='rp-done' id='review-next'>
          <Check size={13} /> {markedWord}
        </span>
      )}
      {(pill.stage === 'todo' || pill.stage === 'last') && (
        <Button variant='primary' size='sm' id='review-next' onClick={markAndNext}>
          <Check size={13} />
          {pill.stage === 'todo' ? markedWord + ' · next ' + noun : 'Mark ' + markedWord.toLowerCase()}
        </Button>
      )}
      {(pill.stage === 'done' || pill.stage === 'all') && (
        <Button variant='ghost' size='sm' id='review-undo' onClick={undo}>
          Undo
        </Button>
      )}
      {pill.stage === 'done' && !pill.atEnd && (
        <Button variant='ghost' size='sm' onClick={next}>
          Next <ArrowRight size={13} />
        </Button>
      )}
    </div>
  );
}
