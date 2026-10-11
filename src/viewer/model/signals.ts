// A summary unit's signals: its open concerns, the callers it may break, the reader's marks.

import type { Concern, Flow } from '../../cli-app/summary/store.ts';
import type { SummaryView, ViewUnit } from '../../cli-app/summary/view.ts';
import type { ConcernMark, LensState, SignalId } from '../store.ts';
import { baseName, memo } from '../shared.ts';

export type Unit = ViewUnit;

/**
 * Only for a reason on record: an open concern (by kind) or callers it may break. Older
 * summaries can carry the agent's bare flag: "look".
 */
export const SIGNALS: Record<SignalId, { one: string; many: string }> = {
  bug: { one: 'possible bug', many: 'possible bugs' },
  risk: { one: 'possible risk', many: 'risks' },
  question: { one: 'question', many: 'questions' },
  breaks: { one: 'may break callers', many: 'may break callers' },
  look: { one: 'flagged, no reason given', many: 'no reason given' },
};
const CONCERN_KINDS = ['bug', 'risk', 'question'] as const;

export type Marks = LensState['concernMarks'];

// Keyed by the unit's hash and the concern itself, so a re-summarized unit starts fresh and a reordered list keeps its marks.
export function concernKey(unit: Unit, concern: Concern): string {
  return unit.id + '@' + unit.hash + '#' + concern.kind + ':' + concern.line + ':' + concern.text;
}

export function concernMark(marks: Marks, unit: Unit, concern: Concern): ConcernMark | null {
  return marks.get(concernKey(unit, concern)) || null;
}

/** The unit's concerns the reader hasn't dismissed. */
export function openConcerns(marks: Marks, unit: Unit): Concern[] {
  if (!unit.summary) return [];
  return unit.summary.concerns.filter((concern) => concernMark(marks, unit, concern) !== 'dismissed');
}

/** The open concerns' kinds, by the row each is on ("N12", "O5"): the overview ruler's concern ticks. */
export const openConcernLines = memo(
  (marks: Marks, unit: Unit): ReadonlyMap<string, string> =>
    new Map(openConcerns(marks, unit).map((concern) => [concern.line, concern.kind])),
);

/** Whether the reader dismissed any of the unit's concerns. */
export function hasDismissed(marks: Marks, unit: Unit): boolean {
  return !!unit.summary?.concerns.some((concern) => concernMark(marks, unit, concern) === 'dismissed');
}

/** The unit's signal ids, most serious first. */
export function unitSignals(marks: Marks, unit: Unit): SignalId[] {
  const summary = unit.summary;
  if (!summary) return [];
  const kinds = new Set<string>(openConcerns(marks, unit).map((concern) => concern.kind));
  const signals: SignalId[] = CONCERN_KINDS.filter((kind) => kinds.has(kind));
  if (summary.breaks.length > 0) signals.push('breaks');
  if (summary.unexplainedLook) signals.push('look');
  return signals;
}

export function isFlagged(marks: Marks, unit: Unit): boolean {
  return unitSignals(marks, unit).length > 0;
}

/** "possible bug", or "confirmed bug" once the reader marked it real */
export function concernLabel(concern: Concern, mark: ConcernMark | null): string {
  return mark === 'real' ? 'confirmed ' + concern.kind : SIGNALS[concern.kind].one;
}

export function signalTip(marks: Marks, unit: Unit, signal: SignalId): string {
  if (signal === 'breaks') return 'may break callers: ' + unit.summary!.breaks[0].summary;
  if (signal === 'look') return SIGNALS.look.one;
  return SIGNALS[signal].one + ': ' + openConcerns(marks, unit).find((concern) => concern.kind === signal)!.text;
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
