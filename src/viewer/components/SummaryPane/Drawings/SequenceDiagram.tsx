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
// a sequence: lanes as columns, steps as arrows; a step that opens its unit is a link
const STEP =
  '[&_line]:fill-none [&_line]:stroke-(--step) [&_line]:[stroke-width:var(--step-w)] [&_path]:fill-none [&_path]:stroke-(--step) [&_path]:[stroke-width:var(--step-w)] [&_text]:fill-(--step-text) [&_text]:text-xs';
const STEPS: Record<string, string> = {
  plain: '[--step-text:var(--muted)] [--step-w:1.3] [--step:var(--muted)]',
  added: '[--step-text:var(--add)] [--step-w:2] [--step:var(--add)]',
  changed: '[--step-text:var(--mod)] [--step-w:2] [--step:var(--mod)]',
  removed:
    '[--step-text:var(--del)] [--step-w:2] [--step:var(--del)] [&_line]:[stroke-dasharray:5_4] [&_path]:[stroke-dasharray:5_4]',
};
const HEADS: Record<string, string> = {
  plain: 'fill-muted stroke-none',
  added: 'fill-add stroke-none',
  changed: 'fill-mod stroke-none',
  removed: 'fill-del stroke-none',
};

export function SequenceDiagram({
  sequence,
  moment,
  unitId,
  fill = false,
  onOpen,
}: {
  sequence: SequenceView;
  moment: Moment;
  unitId: string | null;
  /** Scaled to fill its box (the dialog), its text with it; else at its own size */
  fill?: boolean;
  /** A step is about to open its unit (the dialog closes first) */
  onOpen?: () => void;
}) {
  const steps = stepsAt(sequence.steps, moment);
  const width = sequence.lanes.length * LANE_W;
  const height = HEAD_H + steps.length * STEP_H + STEP_H / 2;
  const x = (lane: string) => (sequence.lanes.indexOf(lane) + 0.5) * LANE_W;
  const known = new Set(sequence.units);

  return (
    <div className={fill ? 'min-h-0 flex-1' : 'overflow-x-auto px-4 py-3'}>
      <svg
        className={fill ? 'block size-full font-sans' : 'mx-auto block h-auto max-w-full font-sans'}
        width={fill ? undefined : width}
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
              <path d='M0 0L10 5L0 10z' data-part='seq-head' className={HEADS[kind]} />
            </marker>
          ))}
        </defs>
        {sequence.lanes.map((lane) => (
          <g
            key={lane}
            className='[&_line]:stroke-line [&_line]:[stroke-dasharray:3_4] [&_text]:fill-text [&_text]:text-sm [&_text]:font-semibold'
          >
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
              data-part='seq-step'
              data-kind={kind}
              data-opens={opens || undefined}
              className={clsx(
                STEP,
                STEPS[kind],
                opens && 'cursor-pointer hover:[&_text]:underline',
                step.unit === unitId && unitId !== null && '[&_text]:font-bold',
              )}
              data-step={stepIndex}
              onClick={
                opens
                  ? () => {
                      onOpen?.();
                      openSummaryUnit(step.unit!);
                    }
                  : undefined
              }
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
