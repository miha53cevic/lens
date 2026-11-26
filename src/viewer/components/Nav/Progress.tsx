import { Copy } from 'lucide-react';
import { useLens } from '../../store.ts';
import { diffLines, fileProgress, unitProgress } from '../../model/progress.ts';
import { handoff } from '../../model/realConcerns.ts';
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
      <DiffLinesLine />
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
  const notes = useLens((state) => (state.data.summary ? null : handoff(state)));
  const copied = useLens((state) => state.handoffCopied);
  if (!notes || notes.notes.length === 0) return null;
  return (
    <span data-part='notes-for-agent' className='inline-flex flex-wrap items-center gap-1 text-xs text-muted'>
      {plural(notes.notes.length, 'note')} for your agent
      <Button
        variant='ghost'
        size='xs'
        id='notes-copy'
        data-copied={copied ? '' : undefined}
        className={copied ? 'text-add' : undefined}
        onClick={(event) => void copyForAgent(notes, event.currentTarget)}
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

/**
 * The diff's lines added and removed: the third line on both tabs, so the ring keeps its place when the
 * reader switches. None when nothing was added or removed (a review of paths, not a diff).
 */
function DiffLinesLine() {
  const { added, removed } = useLens((state) => diffLines(state));
  if (added === 0 && removed === 0) return null;
  return (
    <span data-part='diff-lines' className='inline-flex items-baseline gap-1 text-xs'>
      <span className='font-mono text-add'>+{added.toLocaleString('en-US')}</span>
      <span className='font-mono text-del'>−{removed.toLocaleString('en-US')}</span>
      <span className='text-faint'>lines</span>
    </span>
  );
}

/** The top of the Summary tab's list: how many changes the reader reviewed. Its flagged count is the signal filter's "All". */
export function ChangesProgress() {
  const { done, total, changed } = useLens((state) => unitProgress(state)!);
  return (
    <ProgressRing done={done} total={total} label={total === 1 ? 'change reviewed' : 'changes reviewed'}>
      <DiffLinesLine />
      <ChangedLegend changed={changed} />
    </ProgressRing>
  );
}
