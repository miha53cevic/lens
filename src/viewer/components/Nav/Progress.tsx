import { Copy } from 'lucide-react';
import { useLens } from '../../store.ts';
import { fileProgress, unitProgress } from '../../model/progress.ts';
import { listModel } from '../../model/summaryList.ts';
import { notesForAgent } from '../../model/realConcerns.ts';
import { copyForAgent } from '../../actions/notes.ts';
import { plural } from '../../shared.ts';
import { Button } from '../../../ui/Button.tsx';
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
  if (!handoff || handoff.notes.length === 0) return null;
  return (
    <span className='legend notes-for-agent'>
      {plural(handoff.notes.length, 'note')} for your agent
      <Button variant='ghost' size='sm' id='notes-copy' onClick={() => void copyForAgent(handoff)}>
        <Copy size={11} /> Copy
      </Button>
    </span>
  );
}

/** How many were viewed, then changed: they count as not viewed again, and this says why. */
function ChangedLegend({ changed }: { changed: number }) {
  if (changed === 0) return null;
  return <span className='legend changed'>{changed} changed since viewed</span>;
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
      <span className='legend'>{legend}</span>
      <ChangedLegend changed={changed} />
    </ProgressRing>
  );
}
