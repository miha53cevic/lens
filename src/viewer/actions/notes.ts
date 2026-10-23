// The reader's notes: written under the lines they select, kept by the server per review (.lens/notes/),
// edited and resolved in place. Only the reader writes them; lens copies the ones with a kind for
// the agent when the reader asks (model/realConcerns.ts) and sends nothing anywhere itself.

import type { NoteKind, ReaderNote } from '../../cli-app/notes/store.ts';
import type { NewNote, NotesResponse } from '../../cli-app/notes/routes.ts';
import { commit, getState, update } from '../store.ts';
import { askSelection } from '../model/askContext.ts';
import { fileByPath, fileText, placeOn } from '../model/notes.ts';
import { setAsk } from '../ask/rail.ts';
import { confirmedLabel, type RealConcerns } from '../model/realConcerns.ts';
import { noteDone, noteFailure, request, tracked } from './status.ts';

const NOTE_INPUT = 'note-input';

function focusComposer() {
  document.getElementById(NOTE_INPUT)?.focus();
}

/**
 * A note on the kept selection: the composer opens under its last line. It takes one side: the new
 * code's lines when it has any, else the removed ones (a run of them, as a note's lines are).
 */
export function startNote(): void {
  const state = getState();
  const selection = askSelection(state);
  const file = selection && fileByPath(state.data, selection.file);
  if (!selection || !file) {
    noteDone('Select the lines to note', 'then press n, or right-click them');
    return;
  }
  const side = selection.lines.some((line) => line.side === 'new' && line.n !== null) ? 'new' : 'old';
  const numbers = selection.lines.filter((line) => line.side === side && line.n !== null).map((line) => line.n!);
  if (numbers.length === 0) return;
  const { lines, removed } = fileText(file);
  const start = Math.min(...numbers);
  const last = Math.max(...numbers);
  let end = start;
  // removed lines a selection takes across two hunks aren't one run: the note takes the first
  if (side === 'new') end = last;
  else while (end < last && removed.has(end + 1)) end++;
  const text = [];
  for (let line = start; line <= end; line++) text.push((side === 'new' ? lines[line - 1] : removed.get(line)) ?? '');
  const label = (side === 'new' ? 'N' : 'O') + end;
  commit({ noteDraft: { file: file.file, side, start, end, lines: text, label, editing: null } });
  // the lines have their note now: the Ask chip mustn't keep pointing at them
  setAsk({ selection: null });
  document.getSelection()?.removeAllRanges();
  focusComposer();
}

/** The note's composer opens where it is now, with its kind and text. */
export function editNote(note: ReaderNote): void {
  const file = fileByPath(getState().data, note.file);
  const placed = file && placeOn(file, note);
  if (!placed) return;
  const { file: path, side, lines } = note;
  commit({
    noteDraft: { file: path, side, start: placed.start, end: placed.end, lines, label: placed.label, editing: note },
  });
  focusComposer();
}

export function cancelNote(): void {
  update({ noteDraft: null });
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/** Keeps the draft as a note, or the edit of one. A failure leaves the composer as it was. */
export async function saveNote(kind: NoteKind, text: string): Promise<boolean> {
  const draft = getState().noteDraft;
  if (!draft || !text.trim()) return false;
  const editing = draft.editing;
  return tracked({ id: 'note', label: 'Saving the note…', failed: "Couldn't save the note" }, async () => {
    const { file, side, start, end, lines } = draft;
    const body: NewNote = { file, side, start, end, lines, kind, text };
    const response = editing
      ? await request('/api/notes/' + encodeURIComponent(editing.id), json({ kind, text }))
      : await request('/api/notes', json(body));
    const answer: NotesResponse = await response.json();
    update({ notes: answer.notes, noteDraft: null });
    noteDone(
      editing ? 'Note saved' : 'Note added',
      kind === 'note' ? 'only you see it' : 'it goes along when you copy for your agent',
    );
  });
}

/** Done with it: the note goes. */
export async function resolveNote(note: ReaderNote): Promise<void> {
  await tracked({ id: 'note', label: 'Resolving the note…', failed: "Couldn't resolve the note" }, async () => {
    const response = await request('/api/notes/' + encodeURIComponent(note.id), { method: 'DELETE' });
    const answer: NotesResponse = await response.json();
    update((state) => ({
      notes: answer.notes,
      noteDraft: state.noteDraft?.editing?.id === note.id ? null : state.noteDraft,
    }));
    noteDone('Note resolved');
  });
}

/** The handoff's text on the clipboard, for the reader to paste to their agent. */
export async function copyForAgent(handoff: RealConcerns): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(handoff.text);
    noteDone('Copied ' + confirmedLabel(handoff), 'paste them to your agent');
    return true;
  } catch (error) {
    noteFailure("Couldn't copy the notes", (error as Error).message);
    return false;
  }
}
