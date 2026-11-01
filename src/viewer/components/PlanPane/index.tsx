// The Plan tab: the diff against the plan the build followed. What it says is the agent's reading:
// lens checked that each quote is in the plan and each unit in the diff, not that it's right.

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useLens } from '../../store.ts';
import { sendRound } from '../../actions/rounds.ts';
import { noteDone } from '../../actions/status.ts';
import { hiddenStyle, plural } from '../../shared.ts';
import { planForAgent } from '../../model/plan.ts';
import { Button } from '../../../ui/Button.tsx';
import { Item, Unplanned } from './Rows.tsx';

export function PlanPane() {
  const { shown, plan, handoff } = useLens((state) => ({
    shown: state.view === 'plan',
    plan: state.data.summary?.plan ?? null,
    handoff: planForAgent(state.data.summary?.plan ?? null, state.concernMarks),
  }));
  const [copied, setCopied] = useState(false);
  if (!plan) return null;
  const built = plan.items.filter((item) => item.status === 'done').length;
  const copy = async () => {
    await navigator.clipboard.writeText(handoff.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
    noteDone('Copied ' + plural(handoff.findings.length, 'plan finding'), 'paste them to your agent');
    void sendRound(handoff.findings);
  };
  return (
    <div
      id='plan-pane'
      data-part='plan-pane'
      className='min-w-0 flex-1 overflow-auto bg-bg'
      style={hiddenStyle(!shown)}
    >
      <div className='mx-auto flex w-full max-w-[760px] flex-col gap-5 px-6 pt-6 pb-[104px] [&>*]:min-w-0'>
        <div className='-mb-3 truncate font-mono text-sm text-muted' title={plan.file}>
          {plan.file}
        </div>
        <h1
          data-part='plan-headline'
          className='m-0 font-serif text-2xl/[1.22] font-bold tracking-[-0.015em] text-balance text-text'
        >
          {built + ' of ' + plural(plan.items.length, 'plan item') + ' built.'}{' '}
          {plan.unplanned.length > 0 &&
            (plan.unplanned.length === 1 ? "1 change wasn't" : plan.unplanned.length + " changes weren't") +
              ' asked for.'}
        </h1>
        <div className='text-sm text-muted'>
          Your agent's reading of the code, and each quote is checked to be in the plan. A "Done" here is not a test.
        </div>
        {plan.stale && (
          <div
            data-part='sum-note'
            data-stale=''
            className='rounded-md border border-[color-mix(in_oklab,var(--mod)_var(--tint-line),transparent)] bg-surface px-3 py-2 text-md/[1.5] text-mod'
          >
            The diff changed since this was written.
          </div>
        )}
        {handoff.findings.length > 0 && (
          <div
            data-part='plan-handoff'
            className='flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface px-4 py-3'
          >
            <b className='font-semibold text-text'>
              {plural(handoff.findings.length, 'plan finding') + ' marked real'}
            </b>
            <Button size='sm' onClick={() => void copy()}>
              {copied ? <Check size={13} /> : <Copy size={13} />} Copy for your agent
            </Button>
          </div>
        )}
        <div>
          <div className='eyebrow mb-1'>The plan</div>
          {plan.items.map((item) => (
            <Item key={item.quote + item.text} item={item} />
          ))}
        </div>
        {plan.unplanned.length > 0 && (
          <div>
            <div className='eyebrow mb-1'>Not in the plan</div>
            {plan.unplanned.map((entry) => (
              <Unplanned key={entry.unit} unit={entry.unit} note={entry.note} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
