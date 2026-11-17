// One unit: the agent's headline, its concerns, what behaves differently, callers it may
// break, and its code (CodeRows in a code card, as in the Code view).

import { ArrowUpRight } from 'lucide-react';
import { useState } from 'react';
import { useLens } from '../../../store.ts';
import { type Unit, unitLabel } from '../../../model/signals.ts';
import { openUnitInCode } from '../../../actions/summary.ts';
import { fileStatus } from '../../../../ui/FileStatus.tsx';
import { Button } from '../../../../ui/Button.tsx';
import { SummaryRun } from '../SummaryRun.tsx';
import { CodeCard, removedCount } from '../../CodeCard/index.tsx';
import { Concerns } from './Concerns.tsx';
import { Changes } from './Changes.tsx';
import { Breaks } from './Breaks.tsx';
import { UnitCode } from './UnitCode.tsx';
import { UnitRuler } from './UnitRuler.tsx';
import { Drawings } from '../Drawings/index.tsx';
import { CheckoutFirst } from '../CheckoutFirst.tsx';
import { runGoing } from '../../../model/status.ts';
import { AgentText } from '../../AgentText.tsx';

// Mounted per unit (SummaryPane's key): another unit starts afresh.
export function UnitPage({ unit }: { unit: Unit }) {
  /** The cite of the "what behaves differently" row under the pointer: its line is tinted in the code */
  const [hoveredCite, setHoveredCite] = useState<string | null>(null);
  const { command, checkout, inCodeView, running } = useLens((state) => ({
    running: runGoing(state) !== null,
    command: state.data.summary?.command ?? '',
    checkout: state.data.summary?.checkout ?? null,
    inCodeView: state.data.files.some((file) => file.file === unit.displayFile) && unit.ranges.length > 0,
  }));
  const summary = unit.summary;

  return (
    <div data-part='sum-inner' className='flex flex-col gap-5 px-6 pt-6 pb-[104px] [&>*]:min-w-0'>
      {summary ? (
        <h1
          data-part='sum-headline'
          className='m-0 font-serif text-2xl/[1.22] font-bold tracking-[-0.015em] text-balance text-text'
        >
          <AgentText text={summary.headline} />
        </h1>
      ) : (
        <h1
          data-part='sum-headline'
          data-pending=''
          className='m-0 font-mono text-xl/[1.3] font-medium text-balance text-muted'
        >
          {unitLabel(unit)}
        </h1>
      )}
      {unit.stale ? (
        <div
          data-part='sum-note'
          data-stale=''
          className='rounded-md border border-[color-mix(in_oklab,var(--mod)_var(--tint-line),transparent)] bg-surface px-3 py-2 text-md/[1.5] text-mod'
        >
          The code changed since this was summarized.{' '}
          {running ? (
            'Your agent is writing it again.'
          ) : checkout ? (
            <CheckoutFirst checkout={checkout} />
          ) : (
            <SummaryRun command={command}>{(copy) => <>Run {copy} again to update it.</>}</SummaryRun>
          )}
        </div>
      ) : (
        !summary && (
          <div
            data-part='sum-note'
            className='rounded-md border border-line bg-surface px-3 py-2 text-md/[1.5] text-muted'
          >
            {running ? 'On its way: your agent is writing this summary.' : 'Not summarized yet. '}
            {running ? null : checkout ? (
              <CheckoutFirst checkout={checkout} />
            ) : (
              <SummaryRun command={command}>{(copy) => <>Run {copy} in your agent.</>}</SummaryRun>
            )}
          </div>
        )
      )}
      {summary && summary.concerns.length > 0 && <Concerns unit={unit} />}
      {summary && summary.changes.length > 0 && <Changes changes={summary.changes} onHover={setHoveredCite} />}
      <Drawings unitId={unit.id} />
      {summary && summary.breaks.length > 0 && <Breaks unit={unit} />}
      <CodeCard
        status={fileStatus(unit.status)}
        path={unit.displayFile}
        scope={unitLabel(unit)}
        added={unit.changedLines.length}
        removed={removedCount(unit.removals)}
        tag={unit.formattingOnly ? 'formatting only' : undefined}
        part='unit-card'
        className=''
        ruler={<UnitRuler unit={unit} />}
        action={
          inCodeView && (
            <Button variant='ghost' size='sm' id='open-in-code' shortcut='o' onClick={() => openUnitInCode(unit)}>
              Open in Code <ArrowUpRight size={12} />
            </Button>
          )
        }
      >
        <UnitCode unit={unit} hoveredCite={hoveredCite} />
      </CodeCard>
    </div>
  );
}
