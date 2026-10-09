import type { ReactNode } from 'react';
import clsx from 'clsx';
import { useLens, type SignalFilter } from '../../../store.ts';
import { isFlagged, openConcerns, type Unit } from '../../../model/signals.ts';
import { listModel } from '../../../model/summaryList.ts';
import { setSignalFilter } from '../../../actions/summary.ts';
import { plural } from '../../../shared.ts';
import { Info } from '../../Info.tsx';

const AGENT_NOTE = "The agent's judgement — lens doesn't verify it.";

interface StatsProps {
  units: Unit[];
  flowCount: number;
}

/** The overview's counts; the bug and flagged numbers filter the list. */
export function Stats({ units, flowCount }: StatsProps) {
  const { marks, signal } = useLens((state) => ({ marks: state.concernMarks, signal: listModel(state)!.signal }));
  const fileCount = new Set(units.map((unit) => unit.displayFile)).size;
  const flagged = units.filter((unit) => isFlagged(marks, unit)).length;
  const callerLines = units.flatMap((unit) =>
    unit.summary
      ? unit.summary.breaks.flatMap((possibleBreak) =>
          possibleBreak.callers.map((caller) => caller.file + ':' + caller.line),
        )
      : [],
  );
  const stale = units.filter((unit) => unit.stale).length;
  const bugs = units.reduce(
    (count, unit) => count + openConcerns(marks, unit).filter((concern) => concern.kind === 'bug').length,
    0,
  );

  return (
    <div className='ov-stats'>
      <Stat value={units.length}>
        {(units.length === 1 ? 'change' : 'changes') + ' in ' + plural(fileCount, 'file')}
      </Stat>
      <Stat value={flowCount}>{flowCount === 1 ? 'flow' : 'flows'}</Stat>
      <FilterStat value={bugs} tone='red' filter='bug' signal={signal}>
        {'possible ' + (bugs === 1 ? 'bug ' : 'bugs ')}
        <Info title='possible bugs' note={AGENT_NOTE}>
          What the agent suspects is wrong. You decide: mark each one real or dismiss it on the change's page. Dismissed
          ones don't count here. Click the number to list only the changes that have one.
        </Info>
      </FilterStat>
      <FilterStat value={flagged} tone='amber' filter='any' signal={signal}>
        {'flagged '}
        <Info title='flagged' note={AGENT_NOTE}>
          Changes with a reason to look closely: a possible bug (⚠), a risk (!), a question (?) the agent raised, or
          callers outside the diff it may break (↗). Dismissed concerns don't count. Click the number to list only
          these.
        </Info>
      </FilterStat>
      <Stat value={new Set(callerLines).size} tone='amber'>
        {'callers outside the diff '}
        <Info title='callers outside the diff'>
          Call sites the diff didn't touch that the agent found may break. Each one is checked: the line exists and
          mentions the changed unit.
        </Info>
      </Stat>
      <Stat value={stale} tone='amber'>
        {'stale '}
        <Info title='stale'>
          Changes whose code moved on since they were summarized. Run the summary again to update them.
        </Info>
      </Stat>
    </div>
  );
}

function Stat({ value, tone, children }: { value: number; tone?: string; children: ReactNode }) {
  return (
    <div className={clsx('ov-stat', value > 0 && tone)}>
      <div className='v'>{value}</div>
      <div className='l'>{children}</div>
    </div>
  );
}

interface FilterStatProps {
  value: number;
  tone: string;
  filter: 'bug' | 'any';
  signal: SignalFilter;
  children: ReactNode;
}

/** A stat whose number lists only the units with that signal. */
function FilterStat({ value, tone, filter, signal, children }: FilterStatProps) {
  return (
    <div className={clsx('ov-stat', value > 0 && tone)}>
      <button
        className='v ov-filter'
        data-sig={filter}
        aria-pressed={signal === filter}
        title='list only these'
        disabled={value === 0}
        onClick={() => setSignalFilter(filter)}
      >
        {value}
      </button>
      <div className='l'>{children}</div>
    </div>
  );
}
