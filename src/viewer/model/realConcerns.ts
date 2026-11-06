// The findings the reader marked real (concerns and callers it may break), and the notes they wrote
// for the agent, as text for the agent that will fix them.

import type { ReaderNote } from '../../cli-app/notes/store.ts';
import type { LensState } from '../store.ts';
import type { ViewerPayload } from '../../cli-app/render/web/server.ts';
import { memo, plural } from '../shared.ts';
import { type Finding, findingMark, findings, type Marks, type Unit, unitViewKey } from './signals.ts';
import { forAgent, placeOn } from './notes.ts';

export interface RealConcerns {
  /** The confirmed findings, in the summary's order */
  items: { unit: Unit; finding: Finding }[];
  /** How many of them are concerns, and how many callers it may break */
  concernCount: number;
  breakCount: number;
  /** How many units they are in */
  unitCount: number;
  /** The reader's notes that go along: a bug, risk or question (a plain note stays theirs) */
  notes: ReaderNote[];
  /** Confirmed findings left out: their unit's code changed since, so their lines may point elsewhere */
  stale: number;
  /** What the copy button copies */
  text: string;
}

/** "2 notes and 1 concern": the reader's notes, then what is confirmed by kind, each finding's word prefixed */
export function confirmedLabel(real: RealConcerns, prefix = ''): string {
  const parts = [];
  if (real.notes.length > 0) parts.push(plural(real.notes.length, 'note'));
  if (real.concernCount > 0) parts.push(plural(real.concernCount, prefix + 'concern'));
  if (real.breakCount > 0) parts.push(plural(real.breakCount, prefix + 'possible break'));
  return parts.join(' and ');
}

/** One finding as the agent can act on it: where it is ("N31" a line of the file, "O16" one the diff removed) and what it says. */
function findingText(unit: Unit, finding: Finding, index: number): string {
  if (finding.kind === 'breaks') {
    const callers = finding.possibleBreak.callers.map((caller) => caller.file + ':' + caller.line).join(', ');
    return (
      `\n${index + 1}. [breaks callers] ${unit.displayFile} — ${unit.name}\n   ${finding.text}` +
      (callers ? '\n   Callers: ' + callers : '')
    );
  }
  const { line } = finding.concern;
  const place = line.startsWith('O')
    ? `${unit.displayFile} (removed line ${line.slice(1)})`
    : `${unit.displayFile}:${line.slice(1)}`;
  return `\n${index + 1}. [${finding.kind}] ${place} — ${unit.name}\n   ${finding.text}`;
}

const lineSpan = (start: number, end: number) => (start === end ? String(start) : start + '–' + end);

/** One of the reader's notes as the agent can act on it: where its lines are now, and what it says. */
function noteText(files: ViewerPayload['files'], note: ReaderNote, index: number): string {
  const file = files.find((candidate) => candidate.file === note.file);
  const placed = file ? placeOn(file, note) : null;
  const start = placed?.start ?? note.start;
  const end = placed?.end ?? note.end;
  const place =
    note.side === 'old'
      ? `${note.file} (removed ${start === end ? 'line' : 'lines'} ${lineSpan(start, end)})`
      : `${note.file}:${lineSpan(start, end)}`;
  const changed = placed && !placed.changed ? '' : '\n   (The code there changed since this was written.)';
  return `\n${index + 1}. [${note.kind} · reviewer] ${place}\n   ${note.text.split('\n').join('\n   ')}${changed}`;
}

/** What the text asks first: who raised what, and what to do with each kind. */
function intro(confirmed: number, notes: number): string {
  if (notes === 0) return 'Fix these review findings. Each was raised in a lens review and confirmed by the reviewer.';
  const what = 'Fix the bugs and risks; answer the questions without changing code.';
  return confirmed === 0
    ? 'Act on these notes the reviewer wrote in a lens review. ' + what
    : 'Act on these lens review findings: the reviewer raised some and confirmed the others. ' + what;
}

/**
 * The marks a stale unit's findings got: its summary is gone from the view, but its marks are still
 * keyed by the hash that summary was written for.
 */
function staleRealMarks(marks: Marks, unit: Unit): number {
  if (!unit.staleHash) return 0;
  const prefix = unitViewKey({ ...unit, hash: unit.staleHash }) + '#';
  let count = 0;
  for (const [key, mark] of marks) if (mark === 'real' && key.startsWith(prefix)) count++;
  return count;
}

export const realConcerns = memo(
  (
    units: readonly Unit[],
    marks: Marks,
    allNotes: readonly ReaderNote[],
    files: ViewerPayload['files'],
  ): RealConcerns => {
    const items: RealConcerns['items'] = [];
    let stale = 0;
    for (const unit of units) {
      stale += staleRealMarks(marks, unit);
      for (const finding of findings(unit)) if (findingMark(marks, finding) === 'real') items.push({ unit, finding });
    }
    const notes = allNotes
      .filter(forAgent)
      .toSorted((one, other) => one.file.localeCompare(other.file) || one.start - other.start);
    const lines = [
      intro(items.length, notes.length),
      ...notes.map((note, index) => noteText(files, note, index)),
      ...items.map(({ unit, finding }, index) => findingText(unit, finding, notes.length + index)),
    ];
    if (stale > 0) {
      lines.push(
        `\nLeft out: ${plural(stale, 'confirmed finding')} on code that changed since the summary was written.`,
      );
    }
    const breakCount = items.filter(({ finding }) => finding.kind === 'breaks').length;
    return {
      items,
      concernCount: items.length - breakCount,
      breakCount,
      unitCount: new Set(items.map((item) => item.unit.id)).size,
      notes,
      stale,
      text: lines.join('\n') + '\n',
    };
  },
);

/** The Code view's copy, with no summary to confirm anything in: the reader's notes alone. */
const NO_UNITS: readonly Unit[] = [];
const NO_MARKS: Marks = new Map();
export function notesForAgent(notes: readonly ReaderNote[], files: ViewerPayload['files']): RealConcerns {
  return realConcerns(NO_UNITS, NO_MARKS, notes, files);
}

/** What a copy for the agent hands over: with a summary, what was confirmed too; memoized, so a selector may return it. */
export function handoff(state: LensState): RealConcerns {
  return state.data.summary
    ? realConcerns(state.data.summary.units, state.concernMarks, state.notes, state.data.files)
    : notesForAgent(state.notes, state.data.files);
}
