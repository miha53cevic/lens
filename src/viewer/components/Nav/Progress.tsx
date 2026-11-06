import { Copy } from 'lucide-react';
import { useLens } from '../../store.ts';
import { fileProgress, unitProgress } from '../../model/progress.ts';
import { listModel } from '../../model/summaryList.ts';
import { notesForAgent } from '../../model/realConcerns.ts';
import { copyForAgent } from '../../actions/notes.ts';
import { plural } from '../../shared.ts';
import { Button } from '../../../ui/Button.tsx';
import { CopiedLabel } from '../CopiedLabel.tsx';
import { ProgressRing } from '../../../ui/ProgressRing.tsx';

/** The top of the sidebar: how many files the reader viewed. */
export function FilesProgress() {
  const { done, total, changed } = useLens((state) => fileProgress(state));
  return (
    <ProgressRing done={done} total={total} label={total === 1 ? 'file viewed' : 'files viewed'}>
      <ChangedLegend changed={changed} />
      <NotesForAgent />
    </ProgressRing>
  );
}

/**
 * The reader's notes for the agent, and the copy that hands them over. With a summary the overview
 * does that, with what was confirmed too; without one, this is the only place.
 */
function NotesForAgent() {
  const handoff = useLens((state) => (state.data.summary ? null : notesForAgent(state.notes, state.data.files)));
  const copied = useLens((state) => state.handoffCopied);
  if (!handoff || handoff.notes.length === 0) return null;
  return (
    <span data-part='notes-for-agent' className='inline-flex flex-wrap items-center gap-1 text-xs text-muted'>
      {plural(handoff.notes.length, 'note')} for your agent
      <Button
        variant='ghost'
        size='xs'
        id='notes-copy'
        data-copied={copied ? '' : undefined}
        className={copied ? 'text-add' : undefined}
        onClick={(event) => void copyForAgent(handoff, event.currentTarget)}
      >
        <CopiedLabel copied={copied} size={11}>
          <Copy size={11} /> Copy
        </CopiedLabel>
      </Button>
    </span>
  );
}

/** How many were viewed, then changed: they count as not viewed again, and this says why. */
function ChangedLegend({ changed }: { changed: number }) {
  if (changed === 0) return null;
  return (
    <span data-part='legend' data-changed='' className='text-xs text-mod'>
      {changed} changed since viewed
    </span>
  );
}

/** The top of the Summary tab's list: how many changes the reader reviewed, and how many are flagged. */
export function ChangesProgress() {
  const { done, total, changed, legend } = useLens((state) => {
    const list = listModel(state)!;
    const progress = unitProgress(state)!;
    return {
      done: progress.done,
      total: progress.total,
      changed: progress.changed,
      legend: list.summarized === 0 ? 'not summarized yet' : list.counts.any + ' flagged',
    };
  });
  return (
    <ProgressRing done={done} total={total} label={total === 1 ? 'change reviewed' : 'changes reviewed'}>
      <span data-part='legend' className='text-xs text-faint'>
        {legend}
      </span>
      <ChangedLegend changed={changed} />
    </ProgressRing>
  );
}
