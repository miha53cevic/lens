import { useState } from 'react';
import type { SequenceView } from '../../../../cli-app/summary/view.ts';
import type { StepChange } from '../../../../cli-app/summary/store.ts';
import { BeforeNow, type Moment } from './BeforeNow.tsx';
import { SequenceDiagram } from './SequenceDiagram.tsx';

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
            <span key={kind} className={'step-kind ' + kind}>
              <i className='dot' />
              {kind}
            </span>
          ))}
        </div>
        <span className='drawing-note'>Click a step to open its change</span>
      </footer>
    </section>
  );
}
