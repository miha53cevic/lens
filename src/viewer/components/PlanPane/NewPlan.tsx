import { useState } from 'react';
import { CopyCommand } from '../../../ui/CopyCommand.tsx';
import { Tag } from '../../../ui/Tag.tsx';
import { TextArea } from '../../../ui/TextArea.tsx';
import { newPlanCommand } from '../../model/planTab.ts';

/** A start for the request, which the reader goes on typing */
const STARTS = [
  { label: 'Feature', text: 'Plan a feature: ' },
  { label: 'Compare options', text: 'Compare options for ' },
  { label: 'Bug fix', text: 'Plan a fix for ' },
  { label: 'Refactor', text: 'Plan a refactor of ' },
];

/**
 * New plan: what to plan, as the /lavish command the reader pastes into their agent. lens starts
 * no agent: once the agent runs Lavish, the plan shows in the list (the stamp poll notices it).
 */
export function NewPlan() {
  const [draft, setDraft] = useState('');

  return (
    <div data-part='new-plan' className='mx-auto mt-7 flex w-full max-w-[640px] flex-col gap-3 px-6'>
      <span className='eyebrow text-muted'>New plan</span>
      <TextArea
        id='plan-request'
        rows={4}
        placeholder='What should the plan be about?'
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className='flex flex-wrap gap-2'>
        {STARTS.map((start) => (
          <Tag
            key={start.label}
            data-start={start.label}
            onClick={() => {
              // a start replaces another start, and keeps what was typed after it
              const rest = STARTS.reduce(
                (text, other) => (text.startsWith(other.text) ? text.slice(other.text.length) : text),
                draft,
              );
              setDraft(start.text + rest);
              document.getElementById('plan-request')?.focus();
            }}
          >
            {start.label}
          </Tag>
        ))}
      </div>
      <p className='leading-[1.6] text-muted'>
        Paste this into your agent. It makes the plan with Lavish, and the plan opens in this list: annotate it, answer
        its questions, and press its Build it button when it's right.
      </p>
      <CopyCommand block wrap command={newPlanCommand(draft)} />
    </div>
  );
}
