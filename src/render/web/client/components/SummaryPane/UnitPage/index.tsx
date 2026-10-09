// One unit: the agent's headline, its concerns, When / Before / Now, callers it may break,
// and its code (CodeRows, as in the Code view).

import { ArrowUpRight } from 'lucide-react';
import { useState } from 'react';
import { useLens } from '../../../store.ts';
import { type Unit, unitLabel, unitViewKey } from '../../../model/signals.ts';
import { openUnitInCode } from '../../../actions/summary.ts';
import { toggleUnitViewed } from '../../../actions/viewed.ts';
import { Concerns } from './Concerns.tsx';
import { Changes } from './Changes.tsx';
import { Breaks } from './Breaks.tsx';
import { UnitCode } from './UnitCode.tsx';

// Mounted per unit (SummaryPane's key): another unit starts afresh.
export function UnitPage({ unit }: { unit: Unit }) {
  /** The cite of the When / Before / Now row under the pointer: its line is tinted in the code */
  const [hoveredCite, setHoveredCite] = useState<string | null>(null);
  const { command, viewed, inCodeView } = useLens((state) => ({
    command: state.data.summary?.command ?? '',
    viewed: state.viewedUnits.has(unitViewKey(unit)),
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
          The code changed since this was summarized. Run <code>{command}</code> again to update it.
        </div>
      ) : (
        !summary && (
          <div className='sum-note'>
            Not summarized yet — run <code>{command}</code> in your agent.
          </div>
        )
      )}
      {summary && summary.concerns.length > 0 && <Concerns unit={unit} concerns={summary.concerns} />}
      {summary && summary.changes.length > 0 && <Changes changes={summary.changes} onHover={setHoveredCite} />}
      {summary && summary.breaks.length > 0 && <Breaks breaks={summary.breaks} />}
      <div className='unit-head'>
        <span className='path' title={unit.id}>
          {unit.displayFile}
        </span>
        <span className={'status ' + unit.status}>
          {unit.status + (unit.formattingOnly ? ' · formatting only' : '')}
        </span>
        <label className='control' title='mark this change as viewed (m)'>
          <input type='checkbox' id='sum-viewed' checked={viewed} onChange={() => toggleUnitViewed(unit)} /> viewed
        </label>
        {inCodeView && (
          <button id='open-in-code' title='open in the code view (o)' onClick={() => openUnitInCode(unit)}>
            code view <ArrowUpRight size={12} />
          </button>
        )}
      </div>
      <UnitCode unit={unit} hoveredCite={hoveredCite} />
    </div>
  );
}
