import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { NoteDraft } from '../../store.ts';
import type { FileNotes } from '../../model/notes.ts';
import { NoteComposer } from './Composer.tsx';
import { NoteCard } from './index.tsx';

/**
 * Adds the reader's notes on a file, and the note being written there, to a view's row marks: each
 * under its last line, that line marked. Both views call it, so a note shows the same in either.
 */
export function addNoteMarks(
  marks: { classes: Map<string, string>; notes: Map<string, ReactNode[]> },
  fileNotes: FileNotes,
  draft: NoteDraft | null,
  path: string,
): void {
  const add = (label: string, node: ReactNode) => marks.notes.set(label, [...(marks.notes.get(label) ?? []), node]);
  for (const [label, placedNotes] of fileNotes.byLabel) {
    for (const { note, placed } of placedNotes) {
      if (draft?.editing?.id === note.id) continue; // its composer takes its place
      add(label, <NoteCard key={note.id} note={note} placed={placed} />);
      marks.classes.set(label, clsx(marks.classes.get(label), 'noted', 'k-' + note.kind));
    }
  }
  if (draft && draft.file === path) {
    add(draft.label, <NoteComposer key={'draft:' + draft.label + ':' + (draft.editing?.id ?? '')} draft={draft} />);
  }
}

/** The file's notes whose lines are gone: above its code, so none drops out unseen. */
export function OutdatedNotes({ fileNotes }: { fileNotes: FileNotes }) {
  if (fileNotes.outdated.length === 0) return null;
  return (
    <div data-part='outdated-notes' className='border-b border-line py-2 [&_[data-part=line-note]]:ml-4'>
      {fileNotes.outdated.map((note) => (
        <NoteCard key={note.id} note={note} placed={null} />
      ))}
    </div>
  );
}
