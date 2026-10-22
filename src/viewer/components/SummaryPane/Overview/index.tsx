// The Summary tab's start page: the agent's account of the whole diff, under what it flagged.

import clsx from 'clsx';
import { useLens, type SignalId } from '../../../store.ts';
import { SIGNALS } from '../../../model/signals.ts';
import { listModel } from '../../../model/summaryList.ts';
import { setSignalFilter } from '../../../actions/summary.ts';
import { plural } from '../../../shared.ts';
import { AgentOverview } from './AgentOverview.tsx';
import { RealConcerns } from './RealConcerns.tsx';
import { Drawings } from '../Drawings/index.tsx';
import { SignalIcon } from '../../SignalIcon.tsx';
import { Tag } from '../../../../ui/Tag.tsx';

const SHOWN_SIGNALS: SignalId[] = ['bug', 'risk', 'question', 'breaks'];

export function Overview() {
  const { summary, list, label, checking } = useLens((state) => ({
    summary: state.data.summary!,
    list: listModel(state)!,
    label: state.data.label,
    checking: state.summaryChecking,
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
            // the list's signal filters (SignalChips), at the overview's size: the color once it's on
            <Tag
              key={signal}
              className={clsx('ov-stat', 'sig-' + signal)}
              data-sig={signal}
              color={list.signal === signal ? 'var(--sig)' : undefined}
              icon={<SignalIcon signal={signal} size={11} />}
              pressed={list.signal === signal}
              onClick={() => setSignalFilter(signal)}
            >
              <b>{list.counts[signal]}</b> {list.counts[signal] === 1 ? SIGNALS[signal].one : SIGNALS[signal].many}
            </Tag>
          ))}
        </div>
      )}
      <RealConcerns />
      <AgentOverview summary={summary} anySummarized={list.summarized > 0} checking={checking} />
      <Drawings unitId={null} />
    </div>
  );
}
