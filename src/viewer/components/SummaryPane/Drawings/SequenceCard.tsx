import { useState } from 'react';
import type { SequenceView } from '../../../../cli-app/summary/view.ts';
import type { StepChange } from '../../../../cli-app/summary/store.ts';
import { BeforeNow, type Moment } from './BeforeNow.tsx';
import { DrawingDialog, ExpandButton } from './DrawingDialog.tsx';
import { SequenceDiagram } from './SequenceDiagram.tsx';
import { Tag } from '../../../../ui/Tag.tsx';

const STEP_DOT: Record<StepChange, string> = { added: 'var(--add)', changed: 'var(--mod)', removed: 'var(--del)' };

const KINDS: StepChange[] = ['added', 'changed', 'removed'];

/** What happens at run time, before and now, as lens draws the agent's steps. Expanded, it fills a dialog. */
export function SequenceCard({ sequence, unitId }: { sequence: SequenceView; unitId: string | null }) {
  const [moment, setMoment] = useState<Moment>('now');
  const [expanded, setExpanded] = useState(false);
  const kinds = KINDS.filter((kind) => sequence.steps.some((step) => step.change === kind));
  const beforeNow = <BeforeNow value={moment} onChange={setMoment} />;
  const footer = (
    <>
      <div className='flex flex-wrap gap-2'>
        {kinds.map((kind) => (
          <Tag key={kind} data-part='step-kind' data-kind={kind} dot={STEP_DOT[kind]}>
            {kind}
          </Tag>
        ))}
      </div>
      <span className='ml-auto text-xs text-faint'>Click a step to open its change</span>
    </>
  );
  return (
    <section
      data-part='sequence-card'
      className='flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-1'
    >
      <header className='flex min-h-control-lg items-center gap-2 border-b border-line px-4 py-2 text-sm text-muted'>
        <span className='overflow-hidden font-semibold text-ellipsis whitespace-nowrap text-text'>
          {sequence.title}
        </span>
        {sequence.stale && (
          <span data-part='drawing-stale' className='text-mod'>
            code changed since
          </span>
        )}
        <span className='flex-1' />
        {beforeNow}
        <ExpandButton onExpand={() => setExpanded(true)} />
      </header>
      <SequenceDiagram sequence={sequence} moment={moment} unitId={unitId} />
      <footer className='flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-2'>{footer}</footer>
      {expanded && (
        <DrawingDialog
          title={sequence.title}
          stale={sequence.stale}
          controls={beforeNow}
          footer={footer}
          onClose={() => setExpanded(false)}
        >
          <SequenceDiagram sequence={sequence} moment={moment} unitId={unitId} fill onOpen={() => setExpanded(false)} />
        </DrawingDialog>
      )}
    </section>
  );
}
