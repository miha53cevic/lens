import { Check, Pencil } from 'lucide-react';
import clsx from 'clsx';
import type { PlacedNote } from '../../../cli-app/notes/place.ts';
import type { ReaderNote } from '../../../cli-app/notes/store.ts';
import { useLens } from '../../store.ts';
import { isBusy } from '../../model/status.ts';
import { editNote, resolveNote } from '../../actions/notes.ts';
import { SignalIcon } from '../SignalIcon.tsx';
import { Button } from '../../../ui/Button.tsx';

/** What the note's top line says after its kind: where it stands, or who sees it. */
function noteState(note: ReaderNote, placed: PlacedNote | null): string {
  if (!placed) return 'outdated: its lines are gone';
  if (placed.changed) return 'the line changed since';
  return note.kind === 'note' ? 'only you see it' : 'goes along to your agent';
}

/** One of the reader's notes, under its last line like a review comment. */
/**
 * A note under its line, like a review comment: the reader's and the agent's concerns on the Summary tab are
 * the same card, in the kind's signal color (--k); a plain note is neutral. Past the gutter, to where the code
 * starts. A concern marked real has its color under it too; one whose lines aren't there as they were is
 * likely dealt with.
 */
export const LINE_NOTE =
  'group/note mt-1 mr-5 mb-2 ml-[5.5rem] max-w-[76ch] rounded-[0_var(--radius-md)_var(--radius-md)_0] border border-l-[3px] border-[color-mix(in_oklab,var(--k,var(--line-strong))_var(--tint-line),transparent)] border-l-(--k,var(--line-strong)) bg-surface px-3 pt-1 pb-2 font-sans text-sm/[1.45] whitespace-normal text-text data-real:bg-[color-mix(in_oklab,var(--k,var(--line-strong))_var(--tint),var(--surface))] data-changed:opacity-75 data-changed:focus-within:opacity-100 data-changed:hover:opacity-100';

export function NoteCard({ note, placed }: { note: ReaderNote; placed: PlacedNote | null }) {
  const busy = useLens((state) => isBusy(state, 'note'));
  return (
    <div
      data-part='line-note'
      data-plain={note.kind === 'note' || undefined}
      data-changed={!placed || placed.changed || undefined}
      className={clsx(LINE_NOTE, 'k-' + note.kind)}
      data-note={note.id}
    >
      <div className='mb-1 flex flex-wrap items-center gap-x-2 gap-y-1'>
        <b className='inline-flex items-center gap-1 text-(--k,var(--line-strong)) group-data-plain/note:text-muted eyebrow sm'>
          {note.kind === 'note' ? (
            'your note'
          ) : (
            <>
              <SignalIcon signal={note.kind} /> {note.kind}
            </>
          )}
        </b>
        <span data-part='rn-meta' className='min-w-0 font-mono text-2xs text-muted'>
          {noteState(note, placed)}
        </span>
        <span className='ml-auto inline-flex flex-wrap items-center gap-1'>
          {placed && (
            <Button variant='ghost' size='xs' data-part='rn-edit' className='' onClick={() => editNote(note)}>
              <Pencil size={11} /> Edit
            </Button>
          )}
          <Button size='xs' data-part='rn-resolve' className='' disabled={busy} onClick={() => void resolveNote(note)}>
            <Check size={11} /> Resolve
          </Button>
        </span>
      </div>
      <div data-part='rn-text' className='[overflow-wrap:anywhere] whitespace-pre-wrap'>
        {note.text}
      </div>
    </div>
  );
}
