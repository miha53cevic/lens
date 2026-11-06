import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { SelfCheckView } from '../../../../cli-app/summary/view.ts';
import { useLens } from '../../../store.ts';
import { openSummaryUnit } from '../../../actions/summary.ts';
import { AgentText } from '../../AgentText.tsx';
import { Disclosure } from '../../../../ui/Disclosure.tsx';
import { Tag } from '../../../../ui/Tag.tsx';

function Check({ check }: { check: SelfCheckView }) {
  const [open, setOpen] = useState(false);
  return (
    <div data-part='self-check' className='flex flex-col gap-1'>
      <div className='text-base text-text'>
        <AgentText text={check.question} />
      </div>
      <Disclosure open={open} className='-mx-2 self-start text-sm text-muted' onClick={() => setOpen(!open)}>
        Show the answer
      </Disclosure>
      {open && (
        <div
          data-part='self-check-answer'
          className='flex flex-col items-start gap-2 border-l-2 border-line-strong pl-3 text-base/[1.6] text-text'
        >
          <span>
            <AgentText text={check.answer} />
          </span>
          {/* opens the unit, not its line: the label's N… means nothing to a reader */}
          <Tag icon={<ArrowRight size={11} />} onClick={() => openSummaryUnit(check.unit)}>
            View code
          </Tag>
          {check.stale && <span className='text-mod'>The code changed since this was written.</span>}
        </div>
      )}
    </div>
  );
}

/** Questions to check your own understanding with: no score and no gate. */
export function SelfChecks() {
  const checks = useLens((state) => state.data.summary?.checks);
  const shown = useLens((state) => state.data.selfChecks);
  if (!shown || !checks || checks.length === 0) return null;
  const flows = [...new Set(checks.map((check) => check.flow))];
  return (
    <div data-part='self-checks' className='flex flex-col gap-3'>
      <div className='eyebrow'>Check yourself</div>
      {flows.map((flow) => (
        <div key={flow} className='flex flex-col gap-3 rounded-md border border-line bg-surface px-4 py-3'>
          <div className='font-serif text-lg font-bold text-text'>{flow}</div>
          {checks
            .filter((check) => check.flow === flow)
            .map((check) => (
              <Check key={check.question} check={check} />
            ))}
        </div>
      ))}
    </div>
  );
}
