import { useState } from 'react';
import type { SequenceView } from '../../../../cli-app/summary/view.ts';
import type { StepChange } from '../../../../cli-app/summary/store.ts';
import { BeforeNow, type Moment } from './BeforeNow.tsx';
import { SequenceDiagram } from './SequenceDiagram.tsx';
import { Tag } from '../../../../ui/Tag.tsx';

const STEP_DOT: Record<StepChange, string> = { added: 'var(--add)', changed: 'var(--mod)', removed: 'var(--del)' };

const KINDS: StepChange[] = ['added', 'changed', 'removed'];

/** What happens at run time, before and now, as lens draws the agent's steps. */
export function SequenceCard({ sequence, unitId }: { sequence: SequenceView; unitId: string | null }) {
  const [moment, setMoment] = useState<Moment>('now');
  const kinds = KINDS.filter((kind) => sequence.steps.some((step) => step.change === kind));
  return (
    <section className='drawing-card sequence-card'>
      <header className='drawing-head'>
        <span className='drawing-title'>{sequence.title}</span>
        {sequence.stale && <span className='drawing-stale'>code changed since</span>}
        <span className='spacer' />
        <BeforeNow value={moment} onChange={setMoment} />
      </header>
      <SequenceDiagram sequence={sequence} moment={moment} unitId={unitId} />
      <footer className='drawing-foot'>
        <div className='drawing-units'>
          {kinds.map((kind) => (
            <Tag key={kind} className={'step-kind ' + kind} dot={STEP_DOT[kind]}>
              {kind}
            </Tag>
          ))}
        </div>
        <span className='drawing-note'>Click a step to open its change</span>
      </footer>
    </section>
  );
}
