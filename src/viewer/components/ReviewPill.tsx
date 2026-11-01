// The review pill under the code: move through the review, marking each file or change
// viewed on the way. Progress itself is the sidebar's ring.

import { ArrowLeft, ArrowRight, Check, Copy } from 'lucide-react';
import { getState, useLens, type LensState } from '../store.ts';
import { activeFile } from '../model/plans.ts';
import { fileProgress, unitProgress } from '../model/progress.ts';
import { currentUnit, summaryPage } from '../model/summaryList.ts';
import { nextFile, nextUnit, reviewedNextUnit, startReview, viewedNextFile } from '../actions/review.ts';
import { stepFile } from '../actions/tabs.ts';
import { stepSummary } from '../actions/summary.ts';
import { toggleFileViewed, toggleUnitViewed } from '../actions/prefs.ts';
import { isTestFile, plural } from '../shared.ts';
import { confirmedLabel, notesForAgent, realConcerns } from '../model/realConcerns.ts';
import { copyForAgent } from '../actions/notes.ts';
import { Button } from '../../ui/Button.tsx';
import { riseIn } from '../../ui/motion.ts';

/** What the pill offers, for the open file or change. */
type Stage = 'hidden' | 'start' | 'todo' | 'last' | 'done' | 'all';

/**
 * What there is to hand the agent once all is reviewed: the reader's notes, and with a summary the
 * findings marked real too (as the overview copies them).
 */
function handoff(state: LensState) {
  return state.data.summary
    ? realConcerns(state.data.summary.units, state.concernMarks, state.notes, state.data.files)
    : notesForAgent(state.notes, state.data.files);
}

export function ReviewPill() {
  const pill = useLens((state) => {
    const codeView = state.view === 'code';
    const page = codeView ? null : summaryPage(state);
    const progress = codeView ? fileProgress(state) : unitProgress(state);
    const file = activeFile(state);
    const shown = codeView ? !!file && !(state.hideTests && isTestFile(file.file)) : true;
    let stage: Stage = 'hidden';
    if (progress && progress.total > 0 && shown && state.view !== 'plan') {
      if (page === 'overview') stage = 'start';
      else if (progress.done === progress.total) stage = 'all';
      else if (progress.currentDone) stage = 'done';
      else stage = progress.next === null ? 'last' : 'todo';
    }
    // only once all is reviewed: the label, not the handoff itself (a new object each time)
    const ready = stage === 'all' ? handoff(state) : null;
    const handoffLabel = ready && ready.items.length + ready.notes.length > 0 ? confirmedLabel(ready) : '';
    return {
      codeView,
      stage,
      handoffLabel,
      total: progress?.total ?? 0,
      atStart: !!progress?.atStart,
      atEnd: !!progress?.atEnd,
    };
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
      <div
        className='absolute bottom-4 left-1/2 z-(--z-float) inline-flex -translate-x-1/2 items-center gap-1 rounded-full border border-line-strong bg-raised p-1 whitespace-nowrap shadow-1'
        id='review-pill'
      >
        <Button variant='primary' size='sm' id='review-next' onClick={startReview}>
          Start review <ArrowRight size={13} />
        </Button>
      </div>
    );
  }
  return (
    <div
      className='absolute bottom-4 left-1/2 z-(--z-float) inline-flex -translate-x-1/2 items-center gap-1 rounded-full border border-line-strong bg-raised p-1 whitespace-nowrap shadow-1'
      id='review-pill'
    >
      <Button variant='ghost' size='sm' id='review-prev' aria-label='Prev' disabled={pill.atStart} onClick={prev}>
        <ArrowLeft size={13} /> <span className='@max-[800px]/editor:hidden'>Prev</span>
      </Button>
      {pill.stage === 'all' && !pill.handoffLabel && (
        <span
          ref={riseIn}
          className='inline-flex h-control-sm items-center gap-2 rounded-full bg-accent px-3 text-sm font-semibold text-accent-fg'
          id='review-next'
        >
          <Check size={13} /> All {plural(pill.total, noun)} {markedWord.toLowerCase()}
        </span>
      )}
      {/* the review is done and there's something for the agent: handing it over is what's next */}
      {pill.stage === 'all' && pill.handoffLabel && (
        <>
          <span
            ref={riseIn}
            className='inline-flex h-control-sm items-center gap-2 rounded-full px-3 text-sm font-semibold text-add'
            id='review-next'
          >
            <Check size={13} /> All {pill.total} {markedWord.toLowerCase()}
          </span>
          <Button
            variant='primary'
            size='sm'
            id='review-handoff'
            onClick={() => void copyForAgent(handoff(getState()))}
          >
            <Copy size={13} /> Copy {pill.handoffLabel}
            <span className='@max-[800px]/editor:hidden'> for your agent</span>
          </Button>
        </>
      )}
      {pill.stage === 'done' && (
        <span
          ref={riseIn}
          className='inline-flex h-control-sm items-center gap-2 rounded-full px-3 text-sm font-semibold text-add'
          id='review-next'
        >
          <Check size={13} /> {markedWord}
        </span>
      )}
      {(pill.stage === 'todo' || pill.stage === 'last') && (
        <Button variant='primary' size='sm' id='review-next' onClick={markAndNext}>
          <Check size={13} />
          {pill.stage === 'todo' ? (
            <>
              {/* on a narrow pane: "Viewed →" */}
              <span>
                {markedWord}
                <span className='@max-[800px]/editor:hidden'>{' · next ' + noun}</span>
              </span>
              <ArrowRight size={13} className='hidden @max-[800px]/editor:inline' />
            </>
          ) : (
            'Mark ' + markedWord.toLowerCase()
          )}
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
