import clsx from 'clsx';
import type { SequenceView } from '../../../../cli-app/summary/view.ts';
import type { SequenceStep } from '../../../../cli-app/summary/store.ts';
import { openSummaryUnit } from '../../../actions/summary.ts';
import type { Moment } from './BeforeNow.tsx';

/** A lane's width, the room for its title and the labels between lanes */
const LANE_W = 150;
const HEAD_H = 34;
const STEP_H = 32;
/** How far a step to its own lane loops out */
const LOOP_W = 28;

/** Before: every step but the added ones, a changed one as it was. Now: every step but the removed ones. */
function stepsAt(steps: SequenceStep[], moment: Moment): SequenceStep[] {
  if (moment === 'now') return steps.filter((step) => step.change !== 'removed');
  return steps
    .filter((step) => step.change !== 'added')
    .map((step) => (step.change === 'changed' && step.was ? { ...step, label: step.was } : step));
}

/** The lanes as columns, the steps as arrows in order; a step with a unit opens it. */
export function SequenceDiagram({
  sequence,
  moment,
  unitId,
}: {
  sequence: SequenceView;
  moment: Moment;
  unitId: string | null;
}) {
  const steps = stepsAt(sequence.steps, moment);
  const width = sequence.lanes.length * LANE_W;
  const height = HEAD_H + steps.length * STEP_H + STEP_H / 2;
  const x = (lane: string) => (sequence.lanes.indexOf(lane) + 0.5) * LANE_W;
  const known = new Set(sequence.units);

  return (
    <div className='sequence-stage'>
      <svg
        className='sequence'
        width={width}
        viewBox={`0 0 ${width} ${height}`}
        role='img'
        aria-label={sequence.title + ' — ' + moment}
      >
        <defs>
          {(['plain', 'added', 'changed', 'removed'] as const).map((kind) => (
            <marker
              key={kind}
              id={'seq-arrow-' + kind}
              viewBox='0 0 10 10'
              refX='9'
              refY='5'
              markerWidth='7'
              markerHeight='7'
              orient='auto-start-reverse'
            >
              <path d='M0 0L10 5L0 10z' className={'seq-head ' + kind} />
            </marker>
          ))}
        </defs>
        {sequence.lanes.map((lane) => (
          <g key={lane} className='seq-lane'>
            <text x={x(lane)} y={HEAD_H / 2} textAnchor='middle'>
              {lane}
            </text>
            <line x1={x(lane)} y1={HEAD_H - 6} x2={x(lane)} y2={height - 4} />
          </g>
        ))}
        {steps.map((step, stepIndex) => {
          const y = HEAD_H + stepIndex * STEP_H + STEP_H / 2 + 4;
          const from = x(step.from);
          const to = x(step.to);
          const kind = step.change ?? 'plain';
          const opens = step.unit !== undefined && known.has(step.unit);
          const self = from === to;
          const end = to + (to > from ? -4 : 4);
          return (
            <g
              key={stepIndex}
              className={clsx('seq-step', kind, opens && 'opens', step.unit === unitId && unitId !== null && 'mine')}
              data-step={stepIndex}
              onClick={opens ? () => openSummaryUnit(step.unit!) : undefined}
            >
              {opens && <title>{step.unit + (step.line ? ' · ' + step.line : '')}</title>}
              {self ? (
                <path d={`M${from} ${y - 8}h${LOOP_W}v12h${-LOOP_W + 4}`} markerEnd={`url(#seq-arrow-${kind})`} />
              ) : (
                <line x1={from} y1={y} x2={end} y2={y} markerEnd={`url(#seq-arrow-${kind})`} />
              )}
              <text
                x={self ? from + LOOP_W + 6 : (from + to) / 2}
                y={self ? y - 2 : y - 6}
                textAnchor={self ? 'start' : 'middle'}
              >
                {step.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
