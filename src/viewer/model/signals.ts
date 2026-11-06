// A summary unit's signals: its open concerns, the callers it may break, the reader's marks.

import type { Concern, Flow } from '../../cli-app/summary/store.ts';
import type { SummaryView, ViewUnit } from '../../cli-app/summary/view.ts';
import type { ConcernMark, LensState, SignalId } from '../store.ts';
import { baseName, memo } from '../shared.ts';

export type Unit = ViewUnit;

/** Only for a reason on record: an open concern (by kind) or callers it may break. */
export const SIGNALS: Record<SignalId, { one: string; many: string }> = {
  bug: { one: 'possible bug', many: 'possible bugs' },
  risk: { one: 'possible risk', many: 'risks' },
  question: { one: 'question', many: 'questions' },
  breaks: { one: 'may break callers', many: 'may break callers' },
};
/** The signals in order, most serious first */
const SIGNAL_ORDER: readonly SignalId[] = ['bug', 'risk', 'question', 'breaks'];

export type Marks = LensState['concernMarks'];
export type PossibleBreak = NonNullable<Unit['summary']>['breaks'][number];

/** Something the agent suspects, which the reader rules on: a concern on a line, or callers it may break. */
export type Finding = { key: string; text: string } & (
  { kind: Concern['kind']; concern: Concern } | { kind: 'breaks'; possibleBreak: PossibleBreak }
);
export type ConcernFinding = Extract<Finding, { concern: Concern }>;
export type BreakFinding = Extract<Finding, { possibleBreak: PossibleBreak }>;

export const isConcern = (finding: Finding): finding is ConcernFinding => finding.kind !== 'breaks';
export const isBreak = (finding: Finding): finding is BreakFinding => finding.kind === 'breaks';

const findingsByUnit = new WeakMap<Unit, Finding[]>();

/** A label counted from the unit's anchor: the same for a unit that only moved, as its hash is. */
function anchoredLabel(unit: Unit, label: string): string {
  const line = Number(label.slice(1));
  return label.startsWith('O') ? 'O' + (line - unit.anchor.o) : 'N' + (line - unit.anchor.n);
}

/**
 * The unit's findings: its concerns, then the callers it may break. Each is keyed by the unit's
 * hash and what it says, so a re-summarized unit starts fresh, and a reordered list or a unit that
 * only moved keeps its marks.
 */
export function findings(unit: Unit): Finding[] {
  let list = findingsByUnit.get(unit);
  if (!list) {
    const prefix = unitViewKey(unit) + '#';
    list = [
      ...(unit.summary?.concerns ?? []).map((concern): Finding => ({
        key: prefix + concern.kind + ':' + anchoredLabel(unit, concern.line) + ':' + concern.text,
        text: concern.text,
        kind: concern.kind,
        concern,
      })),
      ...(unit.summary?.breaks ?? []).map((possibleBreak): Finding => ({
        key: prefix + 'breaks::' + possibleBreak.summary,
        text: possibleBreak.summary,
        kind: 'breaks',
        possibleBreak,
      })),
    ];
    findingsByUnit.set(unit, list);
  }
  return list;
}

export function findingMark(marks: Marks, finding: Finding): ConcernMark | null {
  return marks.get(finding.key) || null;
}

/** The unit's findings the reader hasn't dismissed. */
export function openFindings(marks: Marks, unit: Unit): Finding[] {
  return findings(unit).filter((finding) => findingMark(marks, finding) !== 'dismissed');
}

/** The open concerns' kinds, by the row each is on ("N12", "O5"): the overview ruler's concern ticks. */
export const openConcernLines = memo(
  (marks: Marks, unit: Unit): ReadonlyMap<string, string> =>
    new Map(
      openFindings(marks, unit)
        .filter(isConcern)
        .map(({ concern }) => [concern.line, concern.kind]),
    ),
);

export function hasDismissed(marks: Marks, unit: Unit): boolean {
  return findings(unit).some((finding) => findingMark(marks, finding) === 'dismissed');
}

/** The unit's signal ids, most serious first. */
/** `also`: more kinds the unit has, beside its open findings (the reader's notes on it) */
export function unitSignals(marks: Marks, unit: Unit, also: ReadonlySet<SignalId> = new Set()): SignalId[] {
  const kinds = new Set(openFindings(marks, unit).map((finding) => finding.kind));
  return SIGNAL_ORDER.filter((kind) => kinds.has(kind) || also.has(kind));
}

export function isFlagged(marks: Marks, unit: Unit): boolean {
  return unitSignals(marks, unit).length > 0;
}

/** "possible bug", or "confirmed bug" once the reader marked it real */
export function concernLabel(concern: Concern, mark: ConcernMark | null): string {
  return mark === 'real' ? 'confirmed ' + concern.kind : SIGNALS[concern.kind].one;
}

/** The agent's finding of that kind, or else the reader's own note of it (`notes`: theirs on the unit) */
export function signalTip(
  marks: Marks,
  unit: Unit,
  signal: SignalId,
  notes: readonly { kind: string; text: string }[] = [],
): string {
  const finding = openFindings(marks, unit).find((candidate) => candidate.kind === signal);
  if (finding) return SIGNALS[signal].one + ': ' + finding.text;
  return 'your ' + signal + ': ' + (notes.find((note) => note.kind === signal)?.text ?? '');
}

export function flowPriority(flow: Flow): number {
  return flow.priority || 2;
}

export function unitLabel(unit: Unit): string {
  if (unit.name === '(module)') return 'imports & module-level';
  if (unit.name === '(file)') return baseName(unit.displayFile);
  return unit.name;
}

export function unitViewKey(unit: Unit): string {
  return unit.id + '@' + unit.hash;
}

export function unitById(summary: SummaryView | null, unitId: string | null | undefined): Unit | null {
  return (summary?.units || []).find((unit) => unit.id === unitId) || null;
}
