import { LINE_NOTE } from './index.tsx';
import { useState } from 'react';
import clsx from 'clsx';
import type { NoteKind } from '../../../cli-app/notes/store.ts';
import { type NoteDraft, useLens } from '../../store.ts';
import { isBusy } from '../../model/status.ts';
import { NOTE_KINDS } from '../../model/notes.ts';
import { cancelNote, saveNote } from '../../actions/notes.ts';
import { baseName } from '../../shared.ts';
import { growInput } from '../../ask/rail.ts';
import { Button } from '../../../ui/Button.tsx';
import { Chip } from '../../../ui/Chip.tsx';
import { Kbd } from '../../../ui/Kbd.tsx';
import { TextArea } from '../../../ui/TextArea.tsx';

/** "app.ts:50–51", or "app.ts: removed 16": the lines the note is on. */
function draftPlace(draft: NoteDraft): string {
  const span = draft.start === draft.end ? String(draft.start) : draft.start + '–' + draft.end;
  return baseName(draft.file) + (draft.side === 'old' ? ': removed ' : ':') + span;
}

/** A note being written (or edited) under its lines: its kind, its text. Keyed by the draft, so another starts empty. */
export function NoteComposer({ draft }: { draft: NoteDraft }) {
  const [kind, setKind] = useState<NoteKind>(draft.editing?.kind ?? 'note');
  const [text, setText] = useState(draft.editing?.text ?? '');
  const busy = useLens((state) => isBusy(state, 'note'));
  const blocked = busy || !text.trim();
  const save = () => {
    if (!blocked) void saveNote(kind, text);
  };
  return (
    <div
      data-part='line-note'
      data-plain={kind === 'note' || undefined}
      className={clsx(LINE_NOTE, 'k-' + kind)}
      id='note-composer'
    >
      <div className='mb-1 flex flex-wrap items-center gap-x-2 gap-y-1'>
        <b className='inline-flex items-center gap-1 text-(--k,var(--line-strong)) group-data-plain/note:text-muted eyebrow sm'>
          {draft.editing ? 'edit note' : 'your note'}
        </b>
        <span data-part='rn-meta' className='min-w-0 font-mono text-2xs text-muted'>
          {draftPlace(draft)}
        </span>
        <span className='ml-auto inline-flex flex-wrap items-center gap-1' role='group' aria-label='Kind'>
          {NOTE_KINDS.map((option) => (
            <Chip
              key={option.kind}
              id={'note-kind-' + option.kind}
              color={option.color}
              checked={kind === option.kind}
              onChange={() => setKind(option.kind)}
            >
              {option.label}
            </Chip>
          ))}
        </span>
      </div>
      <TextArea
        className='mt-1 mb-2 w-full'
        id='note-input'
        rows={2}
        value={text}
        placeholder={kind === 'note' ? 'A note for yourself…' : 'What your agent should know…'}
        onChange={(event) => {
          setText(event.target.value);
          growInput(event.target);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            save();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            cancelNote();
          }
        }}
      />
      <div className='flex flex-wrap items-center gap-2'>
        <span className='inline-flex min-w-0 flex-1 flex-wrap gap-3 text-xs text-muted'>
          <span>
            <Kbd size='sm' combo='↵' /> save
          </span>
          <span>
            <Kbd size='sm' combo='⇧ ↵' /> newline
          </span>
          <span>
            <Kbd size='sm' combo='Esc' /> cancel
          </span>
        </span>
        <Button variant='ghost' size='sm' onClick={cancelNote}>
          Cancel
        </Button>
        <Button variant='primary' size='sm' id='note-save' disabled={blocked} onClick={save}>
          Save note
        </Button>
      </div>
    </div>
  );
}
