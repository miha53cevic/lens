import { useMemo, type ReactNode } from 'react';
import clsx from 'clsx';
import { useLens } from '../../../store.ts';
import { concernLabel, concernMark, SIGNALS, type Unit } from '../../../model/signals.ts';
import { unitPlan } from '../../../model/plans.ts';
import { askSelLabels } from '../../../ask/selection.ts';
import { askSelection } from '../../../model/askContext.ts';
import { linesFromTokens } from '../../../shared.ts';
import { CodeRows, RemovedRow } from '../../CodeRows/index.tsx';
import { Verdict } from './Verdict.tsx';

/**
 * The unit's code, as the Code view shows it, and what the summary adds to the rows: the
 * lines the When / Before / Now rows point at, each open concern (its row flagged, a note
 * under it like a review comment), the Ask selection and the hovered cite.
 */
export function UnitCode({ unit, hoveredCite }: { unit: Unit; hoveredCite: string | null }) {
  const { plan, marks, selection } = useLens((state) => ({
    plan: unitPlan(state, unit),
    marks: state.concernMarks,
    selection: askSelection(state),
  }));
  const summary = unit.summary;
  const changedLines = useMemo(() => new Set(unit.changedLines), [unit]);

  const classes = new Map<string, string>();
  const addClass = (label: string, className: string) => classes.set(label, clsx(classes.get(label), className));
  for (const change of summary ? summary.changes : []) addClass(change.line, 'cited');
  const notes = new Map<string, ReactNode[]>();
  (summary ? summary.concerns : []).forEach((concern, concernIndex) => {
    const mark = concernMark(marks, unit, concern);
    if (mark === 'dismissed') return;
    addClass(concern.line, 'flagged k-' + concern.kind);
    const note = (
      <div key={'note' + concernIndex} className={clsx('inline-note', 'k-' + concern.kind, mark)}>
        <div className='n-top'>
          <b>{SIGNALS[concern.kind].icon + ' ' + concernLabel(concern, mark)}</b>
          <Verdict unit={unit} concern={concern} concernIndex={concernIndex} mark={mark} />
        </div>
        <div className='n-text'>{concern.text}</div>
      </div>
    );
    notes.set(concern.line, [...(notes.get(concern.line) ?? []), note]);
  });
  for (const label of askSelLabels(selection)) addClass(label, 'ask-sel');
  if (hoveredCite) addClass(hoveredCite, 'hover-cite');

  return (
    <div className='unit-code'>
      <div className='code'>
        <CodeRows
          path={unit.displayFile}
          items={plan.items}
          lines={plan.file ? linesFromTokens(plan.file) : []}
          changedLines={changedLines}
          gutter={plan.gutter}
          marks={{ classes, notes }}
        />
        {unit.renamedFrom && (
          <>
            <div className='renamed-from'>was {unit.renamedFrom.id}</div>
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
