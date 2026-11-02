// The Summary tab's start page: the agent's account of the whole diff, under what it flagged.

import clsx from 'clsx';
import { useLens, type SignalId } from '../../../store.ts';
import { SIGNALS } from '../../../model/signals.ts';
import { listModel } from '../../../model/summaryList.ts';
import { setSignalFilter } from '../../../actions/summary.ts';
import { plural } from '../../../shared.ts';
import { AgentOverview } from './AgentOverview.tsx';
import { RealConcerns } from './RealConcerns.tsx';
import { Rounds } from './Rounds.tsx';
import { SelfChecks } from './SelfChecks.tsx';
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
    <div
      data-part='sum-inner'
      className='flex flex-col gap-5 px-6 pt-6 pb-[104px] [&>*]:min-w-0 mx-auto w-full max-w-[760px]'
    >
      <div data-part='kicker' className='-mb-3 flex items-center gap-2 text-md text-muted'>
        {plural(units.length, 'change') + ' in ' + plural(fileCount, 'file')}
        {stale > 0 && <span className='text-mod'>{' · ' + stale + ' stale'}</span>}
      </div>
      <h1
        data-part='sum-headline'
        className='m-0 font-serif text-2xl/[1.22] font-bold tracking-[-0.015em] text-balance text-text'
      >
        {summary.overview?.title ?? label ?? 'The changes'}
      </h1>
      {flagged.length > 0 && (
        <div className='-mt-2 flex flex-wrap gap-2'>
          {flagged.map((signal) => (
            // the list's signal filters (SignalChips), at the overview's size: the color once it's on
            <Tag
              key={signal}
              data-part='ov-stat'
              className={clsx('sig-' + signal, '[&>span:first-child]:text-(--sig) [&_b]:text-text [&_b]:tabular-nums')}
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
      <Rounds />
      <RealConcerns />
      <AgentOverview summary={summary} anySummarized={list.summarized > 0} checking={checking} />
      <Drawings unitId={null} />
      <SelfChecks />
    </div>
  );
}
