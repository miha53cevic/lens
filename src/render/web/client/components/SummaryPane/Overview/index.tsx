// The Summary tab's start page: the agent's account of the whole diff, under what it flagged.

import clsx from 'clsx';
import { useLens, type SignalId } from '../../../store.ts';
import { SIGNALS } from '../../../model/signals.ts';
import { listModel } from '../../../model/summaryList.ts';
import { setSignalFilter } from '../../../actions/summary.ts';
import { plural } from '../../../shared.ts';
import { AgentOverview } from './AgentOverview.tsx';

const SHOWN_SIGNALS: SignalId[] = ['bug', 'risk', 'question', 'breaks'];

export function Overview() {
  const { summary, list, label } = useLens((state) => ({
    summary: state.data.summary!,
    list: listModel(state)!,
    label: state.data.label,
  }));
  const units = list.units; // hide tests: the counts follow the list
  const fileCount = new Set(units.map((unit) => unit.displayFile)).size;
  const stale = units.filter((unit) => unit.stale).length;
  const flagged = SHOWN_SIGNALS.filter((signal) => list.counts[signal] > 0);

  return (
    <div className='sum-inner ov-page'>
      <div className='kicker'>
        {plural(units.length, 'change') + ' in ' + plural(fileCount, 'file')}
        {stale > 0 && <span className='stale-count'>{' · ' + stale + ' stale'}</span>}
      </div>
      <h1 className='sum-headline'>{label ?? 'The changes'}</h1>
      {flagged.length > 0 && (
        <div className='ov-stats'>
          {flagged.map((signal) => (
            <button
              key={signal}
              className={clsx('ov-stat', 'sig-' + signal)}
              data-sig={signal}
              aria-pressed={list.signal === signal}
              onClick={() => setSignalFilter(signal)}
            >
              <i />
              <b>{list.counts[signal]}</b> {list.counts[signal] === 1 ? SIGNALS[signal].one : SIGNALS[signal].many}
            </button>
          ))}
        </div>
      )}
      <AgentOverview summary={summary} anySummarized={list.summarized > 0} />
    </div>
  );
}
