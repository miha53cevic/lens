import { LINE_NOTE } from '../../Notes/index.tsx';
import { useMemo, type ReactNode } from 'react';
import clsx from 'clsx';
import { useLens } from '../../../store.ts';
import { concernLabel, findingMark, findings, isConcern, type Unit } from '../../../model/signals.ts';
import { isSplit, showsRemoved, splitRows, unitPlan } from '../../../model/plans.ts';
import { askSelLabels, tintsLeftHalf } from '../../../ask/selection.ts';
import { askSelection } from '../../../model/askContext.ts';
import { fileNotes } from '../../../model/notes.ts';
import { codeLines } from '../../../shared.ts';
import { CodeRows, holdSelectionSide, RemovedRow, SplitRows } from '../../CodeRows/index.tsx';
import { findUsages } from '../../CodeRows/util.ts';
import { SignalIcon } from '../../SignalIcon.tsx';
import { addNoteMarks } from '../../Notes/marks.tsx';
import { Verdict } from './Verdict.tsx';
import { useShownChanges } from './hooks.ts';

/** A unit with no file of its own to read has no removed lines to draw */
const NO_REMOVED: ReadonlyMap<number, string> = new Map();

/**
 * The unit's code, as the Code view shows it, and what the summary adds to the rows: the
 * lines the When / Before / Now rows point at, each open concern (its row flagged, a note
 * under it like a review comment), the reader's notes, the Ask selection and the hovered cite.
 */
export function UnitCode({ unit, hoveredCite }: { unit: Unit; hoveredCite: string | null }) {
  const { plan, marks, readerNotes, draft, selection, showRemoved, wordDiff, split, landed } = useLens((state) => {
    const plan = unitPlan(state, unit);
    return {
      plan,
      marks: state.concernMarks,
      readerNotes: plan.file ? fileNotes(state.notes, plan.file) : null,
      draft: state.noteDraft,
      selection: askSelection(state),
      showRemoved: showsRemoved(state),
      wordDiff: state.wordDiff,
      split: isSplit(state),
      landed: state.landed,
    };
  });
  const summary = unit.summary;
  const changedLines = useShownChanges(unit, plan);
  const pairs = useMemo(
    () => (split ? splitRows(plan.items, plan.file, changedLines) : null),
    [split, plan, changedLines],
  );

  const classes = new Map<string, string>();
  const addClass = (label: string, className: string) => classes.set(label, clsx(classes.get(label), className));
  for (const change of summary ? summary.changes : []) addClass(change.line, 'cited');
  const notes = new Map<string, ReactNode[]>();
  for (const finding of findings(unit).filter(isConcern)) {
    const { concern } = finding;
    const mark = findingMark(marks, finding);
    if (mark === 'dismissed') continue;
    addClass(concern.line, 'flagged k-' + concern.kind);
    const note = (
      <div
        key={finding.key}
        data-part='line-note'
        data-note='inline'
        data-real={mark === 'real' || undefined}
        className={clsx(LINE_NOTE, 'k-' + concern.kind)}
      >
        <div className='mb-1 flex flex-wrap items-center gap-x-2 gap-y-1'>
          <b className='eyebrow sm inline-flex items-center gap-1 text-(--k,var(--line-strong))'>
            <SignalIcon signal={concern.kind} confirmed={mark === 'real'} /> {concernLabel(concern, mark)}
          </b>
          <span className='ml-auto inline-flex flex-wrap items-center gap-1'>
            <Verdict finding={finding} mark={mark} size='xs' />
          </span>
        </div>
        <div data-part='rn-text' className='[overflow-wrap:anywhere] whitespace-pre-wrap'>
          {concern.text}
        </div>
      </div>
    );
    notes.set(concern.line, [...(notes.get(concern.line) ?? []), note]);
  }
  // those of the unit's lines the rows show: a note elsewhere in the file is the Code view's
  if (readerNotes) addNoteMarks({ classes, notes }, readerNotes, draft, unit.displayFile);
  const left = new Map<string, string>();
  for (const label of askSelLabels(selection)) {
    if (tintsLeftHalf(selection, label)) left.set(label, 'ask-sel');
    else addClass(label, 'ask-sel');
  }
  if (hoveredCite) addClass(hoveredCite, 'hover-cite');
  if (landed && landed.path === unit.displayFile) addClass(landed.label, 'landed');

  const { lines, removed, replaced } = plan.file
    ? codeLines(plan.file, wordDiff, showRemoved)
    : { lines: [], removed: NO_REMOVED, replaced: undefined };
  return (
    <div data-part='unit-code' className=''>
      <div
        className={clsx('code', pairs && 'split')}
        onClick={findUsages}
        onMouseDown={pairs ? holdSelectionSide : undefined}
      >
        {pairs ? (
          <SplitRows
            path={unit.displayFile}
            items={pairs}
            lines={lines}
            changedLines={changedLines}
            removed={removed}
            replaced={replaced}
            gutter={plan.gutter}
            marks={{ classes, left, notes }}
          />
        ) : (
          <CodeRows
            path={unit.displayFile}
            items={plan.items}
            lines={lines}
            changedLines={changedLines}
            removed={removed}
            replaced={replaced}
            gutter={plan.gutter}
            marks={{ classes, left, notes }}
          />
        )}
        {unit.renamedFrom && (
          <>
            <div className='px-4 py-1 font-sans text-sm text-muted'>was {unit.renamedFrom.id}</div>
            {unit.renamedFrom.removals.flatMap((block, blockIndex) =>
              block.lines.map((text, lineIndex) => (
                <RemovedRow key={blockIndex + ':' + lineIndex} text={text} gutter={plan.gutter} />
              )),
            )}
          </>
        )}
      </div>
    </div>
  );
}
