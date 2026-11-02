import type { FindingState, RoundFinding } from '../../../../cli-app/rounds/view.ts';
import { useLens, wholeData } from '../../../store.ts';
import { openSummaryUnit } from '../../../actions/summary.ts';
import { setSinceRound } from '../../../actions/rounds.ts';
import { plural } from '../../../shared.ts';
import { AgentText } from '../../AgentText.tsx';
import { Segmented } from '../../../../ui/Segmented.tsx';
import { Tag } from '../../../../ui/Tag.tsx';

/** Lens's words say only that lines changed; "Fixed" is the agent's claim, and nothing else says it. */
const STATES: Record<FindingState, { label: string; color: string; tip: string }> = {
  fixed: { label: 'Fixed', color: 'var(--add)', tip: 'Your agent says so' },
  'not-fixed': { label: 'Not fixed', color: 'var(--bug)', tip: 'Your agent says so' },
  changed: {
    label: 'Lines changed',
    color: 'var(--question)',
    tip: "Its lines changed: lens can't tell if that fixes it",
  },
  nearby: { label: 'Nearby changed', color: 'var(--mod)', tip: 'Its change moved, but not these lines' },
  untouched: { label: 'Untouched', color: 'var(--bug)', tip: 'Nothing here changed since you sent it' },
};

function Sent({ finding }: { finding: RoundFinding }) {
  const state = STATES[finding.state];
  const open = finding.unit ? () => openSummaryUnit(finding.unit!) : undefined;
  return (
    <div
      data-part='round-finding'
      data-state={finding.state}
      className='flex min-w-0 flex-wrap items-center gap-2 py-1'
    >
      <Tag color={state.color} title={state.tip}>
        {state.label}
      </Tag>
      <span className='min-w-0 flex-1 text-sm text-text'>
        <AgentText text={finding.text} />
        {finding.how && (
          <span className='block text-xs text-muted'>
            <AgentText text={finding.how} />
          </span>
        )}
      </span>
      <Tag mono onClick={open} title={finding.displayFile}>
        {finding.displayFile.split('/').pop() ?? finding.displayFile}
        {finding.line === null ? '' : ':' + finding.line}
      </Tag>
    </div>
  );
}

/** What changed since the reader last sent findings, and what became of each. */
export function Rounds() {
  const { round, since, total } = useLens((state) => {
    const whole = wholeData(state);
    return {
      round: whole.summary?.round ?? null,
      since: state.beforeRound !== null,
      total: whole.summary?.units.length ?? 0,
    };
  });
  if (!round) return null;
  const changed = round.units.length;
  return (
    <div data-part='round' className='flex flex-col gap-3 rounded-md border border-line bg-surface px-4 py-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <Segmented
          id='round-view'
          label='what to read'
          value={since ? 'since' : 'all'}
          onChange={(value) => setSinceRound(value === 'since')}
          options={[
            { value: 'all', label: 'The whole change', id: 'round-all' },
            { value: 'since', label: 'Round ' + round.round + ': since you sent', id: 'round-since' },
          ]}
        />
        <span className='text-xs text-muted'>{'You sent ' + plural(round.findings.length, 'finding')}</span>
      </div>
      <div data-part='round-count' className='text-base text-text'>
        {changed === 0 ? (
          'Nothing has changed since you sent them.'
        ) : (
          <>
            <b className='font-semibold'>{plural(changed, 'change')} since your last look.</b>{' '}
            <span className='text-muted'>
              {Math.max(0, total - changed) + ' of ' + total + ' are as you left them.'}
            </span>
          </>
        )}
      </div>
      <div>
        {round.findings.map((finding) => (
          <Sent key={finding.key} finding={finding} />
        ))}
      </div>
    </div>
  );
}
