import { Check, Pencil } from 'lucide-react';
import clsx from 'clsx';
import type { PlacedNote } from '../../../cli-app/notes/place.ts';
import type { ReaderNote } from '../../../cli-app/notes/store.ts';
import { useLens } from '../../store.ts';
import { isBusy } from '../../model/status.ts';
import { editNote, resolveNote } from '../../actions/notes.ts';
import { SignalIcon } from '../SignalIcon.tsx';
import { Button } from '../../../ui/Button.tsx';
import './style.css';

/** What the note's top line says after its kind: where it stands, or who sees it. */
function noteState(note: ReaderNote, placed: PlacedNote | null): string {
  if (!placed) return 'outdated: its lines are gone';
  if (placed.changed) return 'the line changed since';
  return note.kind === 'note' ? 'only you see it' : 'goes along to your agent';
}

/** One of the reader's notes, under its last line like a review comment. */
export function NoteCard({ note, placed }: { note: ReaderNote; placed: PlacedNote | null }) {
  const busy = useLens((state) => isBusy(state, 'note'));
  return (
    <div
      className={clsx('line-note', 'reader-note', 'k-' + note.kind, (!placed || placed.changed) && 'changed')}
      data-note={note.id}
    >
      <div className='rn-top'>
        <b className='rn-kind eyebrow sm'>
          {note.kind === 'note' ? (
            'your note'
          ) : (
            <>
              <SignalIcon signal={note.kind} /> {note.kind}
            </>
          )}
        </b>
        <span className='rn-meta'>{noteState(note, placed)}</span>
        <span className='rn-acts'>
          {placed && (
            <Button variant='ghost' size='xs' className='rn-edit' onClick={() => editNote(note)}>
              <Pencil size={11} /> Edit
            </Button>
          )}
          <Button size='xs' className='rn-resolve' disabled={busy} onClick={() => void resolveNote(note)}>
            <Check size={11} /> Resolve
          </Button>
        </span>
      </div>
      <div className='rn-text'>{note.text}</div>
    </div>
  );
}
