import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { Flow } from '../../../../../../summary/store.ts';
import { useLens } from '../../../store.ts';
import { flowPriority, type Unit, unitLabel, unitSignals, unitViewKey } from '../../../model/signals.ts';
import type { Section } from '../../../model/summaryList.ts';
import { openSummaryUnit } from '../../../actions/summary.ts';
import { baseName, plural } from '../../../shared.ts';
import { FlowPriority } from '../../FlowPriority.tsx';
import { SignalMarker } from '../../SignalMarker.tsx';
import { byFile } from './util.ts';

interface Lanes {
  note: string;
  lanes: ReactNode[];
}

/** Each flow laid out by layer, then the units outside any flow by file. */
export function flowLanes({ sections, others }: { sections: Section[]; others: Unit[] }): Lanes {
  const lanes = sections.map(({ flow, members }) => {
    // the path's steps in order, then any layer the path doesn't name
    const layers = flow.path
      .split('→')
      .map((layer) => layer.trim())
      .filter(Boolean);
    for (const unit of members) if (!layers.includes(flow.units[unit.id])) layers.push(flow.units[unit.id]);
    return (
      <div key={'flow:' + flow.title} className={'ov-lane p' + flowPriority(flow)}>
        <LaneHead title={flow.title} count={plural(members.length, 'change')} flow={flow} />
        <div className='ov-layers'>
          {layers.map((layer) => (
            <Column key={layer} label={layer} units={members.filter((unit) => flow.units[unit.id] === layer)} />
          ))}
        </div>
      </div>
    );
  });
  if (others.length > 0) {
    lanes.push(
      <div key='others' className='ov-lane'>
        <LaneHead
          title={sections.length > 0 ? 'Other changes' : 'Changes'}
          count={plural(others.length, 'change')}
          muted={sections.length > 0}
        />
        <div className='ov-layers files'>
          {[...byFile(others)].map(([file, units]) => (
            <Column key={file} label={baseName(file)} units={units} title={file} />
          ))}
        </div>
      </div>,
    );
  }
  return { note: plural(sections.length, 'flow'), lanes };
}

/** Every change where it lives: a card per folder, a column per file, its units in file order. */
export function mapLanes({ units }: { units: Unit[] }): Lanes {
  const startOf = (unit: Unit) => (unit.ranges.length > 0 ? unit.ranges[0].start : (unit.removals[0]?.anchor ?? 0));
  const sorted = [...units].sort(
    (unitA, unitB) => unitA.displayFile.localeCompare(unitB.displayFile) || startOf(unitA) - startOf(unitB),
  );
  const files = byFile(sorted);
  const folders = new Map<string, [string, Unit[]][]>(); // folder -> its [file, units] entries, in path order
  for (const entry of files) {
    const folder = entry[0].slice(0, entry[0].lastIndexOf('/') + 1);
    folders.set(folder, [...(folders.get(folder) || []), entry]);
  }
  const lanes = [...folders].map(([folder, entries]) => {
    const changeCount = entries.reduce((count, [, fileUnits]) => count + fileUnits.length, 0);
    return (
      <div key={'folder:' + folder} className='ov-lane'>
        <LaneHead
          title={folder || './'}
          count={plural(changeCount, 'change') + ' · ' + plural(entries.length, 'file')}
          mono
        />
        <div className='ov-layers files'>
          {entries.map(([file, fileUnits]) => (
            <Column key={file} label={file.slice(folder.length)} units={fileUnits} title={file} />
          ))}
        </div>
      </div>
    );
  });
  return { note: plural(files.size, 'file') + ' across ' + plural(folders.size, 'folder'), lanes };
}

interface LaneHeadProps {
  title: string;
  count: string;
  muted?: boolean;
  mono?: boolean;
  flow?: Flow;
}

function LaneHead({ title, count, muted, mono, flow }: LaneHeadProps) {
  return (
    <div className='ov-lane-h'>
      {flow && <FlowPriority flow={flow} />}
      <span className={clsx('t', muted && 'muted', mono && 'mono')}>{title}</span>
      {flow?.why && <span className='why'>{flow.why}</span>}
      <span className='n'>{count}</span>
    </div>
  );
}

function Column({ label, units, title }: { label: string; units: Unit[]; title?: string }) {
  return (
    <div className='ov-layer'>
      <div className='ov-layer-l' title={title || undefined}>
        {label}
      </div>
      {units.map((unit) => (
        <UnitChip key={unit.id} unit={unit} />
      ))}
    </div>
  );
}

/** A unit as a tag: status stripe, tinted by its top signal, dimmed once viewed. */
function UnitChip({ unit }: { unit: Unit }) {
  const { marks, viewed } = useLens((state) => ({
    marks: state.concernMarks,
    viewed: state.viewedUnits.has(unitViewKey(unit)),
  }));
  const topSignal = unitSignals(marks, unit)[0];
  return (
    <button
      className={clsx('ov-chip', 'st-' + unit.status, topSignal && 'look sig-' + topSignal, viewed && 'viewed')}
      data-id={unit.id}
      title={unit.summary ? unit.summary.headline : unit.id}
      onClick={() => openSummaryUnit(unit.id)}
    >
      <span className='st-bar' />
      <span className='cn'>{unitLabel(unit)}</span>
      {topSignal && <SignalMarker marks={marks} unit={unit} />}
    </button>
  );
}
