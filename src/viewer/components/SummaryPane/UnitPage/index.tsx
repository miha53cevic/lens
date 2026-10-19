// One unit: the agent's headline, its concerns, what behaves differently, callers it may
// break, and its code (CodeRows in a code card, as in the Code view).

import { ArrowUpRight } from 'lucide-react';
import { useState } from 'react';
import { useLens } from '../../../store.ts';
import { type Unit, unitLabel } from '../../../model/signals.ts';
import { openUnitInCode } from '../../../actions/summary.ts';
import { fileStatus } from '../../../../ui/FileStatus.tsx';
import { Button } from '../../../../ui/Button.tsx';
import { CopyCommand } from '../../../../ui/CopyCommand.tsx';
import { CodeCard, removedCount } from '../../CodeCard.tsx';
import { Concerns } from './Concerns.tsx';
import { Changes } from './Changes.tsx';
import { Breaks } from './Breaks.tsx';
import { UnitCode } from './UnitCode.tsx';
import { UnitRuler } from './UnitRuler.tsx';
import { Drawings } from '../Drawings/index.tsx';

// Mounted per unit (SummaryPane's key): another unit starts afresh.
export function UnitPage({ unit }: { unit: Unit }) {
  /** The cite of the "what behaves differently" row under the pointer: its line is tinted in the code */
  const [hoveredCite, setHoveredCite] = useState<string | null>(null);
  const { command, inCodeView } = useLens((state) => ({
    command: state.data.summary?.command ?? '',
    inCodeView: state.data.files.some((file) => file.file === unit.displayFile) && unit.ranges.length > 0,
  }));
  const summary = unit.summary;

  return (
    <div className='sum-inner'>
      {summary ? (
        <h1 className='sum-headline'>{summary.headline}</h1>
      ) : (
        <h1 className='sum-headline pending'>{unitLabel(unit)}</h1>
      )}
      {unit.stale ? (
        <div className='sum-note stale'>
          The code changed since this was summarized. Run <CopyCommand command={command} /> again to update it.
        </div>
      ) : (
        !summary && (
          <div className='sum-note'>
            Not summarized yet. Run <CopyCommand command={command} /> in your agent.
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
        className='unit-card'
        ruler={<UnitRuler unit={unit} />}
        action={
          inCodeView && (
            <Button variant='ghost' size='sm' id='open-in-code' onClick={() => openUnitInCode(unit)}>
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
