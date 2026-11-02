import type { SentCheck } from '../summary/store.ts';
import { placedHash, type Unit } from '../summary/units.ts';
import type { RemovedBlock } from '../model.ts';
import { fileDelta, readRounds, type FileDelta, type SentFinding } from './store.ts';

// What changed since the reader last sent findings: lens's own measure, against the text kept with
// the round. It can only say whether lines changed, so that is what its words say; whether a
// finding is fixed is the agent's claim, kept apart.

/**
 * Lens's reading ("changed": its lines did; "nearby": its change did, but not those lines; "untouched":
 * neither), or the agent's on the code as it is now ("fixed", "not-fixed").
 */
export type FindingState = 'fixed' | 'not-fixed' | 'changed' | 'nearby' | 'untouched';

export interface RoundFinding extends SentFinding {
  state: FindingState;
  /** The agent's words, on its states */
  how: string | null;
  /** The file as the viewer shows it */
  displayFile: string;
}

export interface RoundView {
  /** The round being read now: 2 after the first send */
  round: number;
  sentAt: number;
  /** The units whose code changed since */
  units: string[];
  /** What changed since, by file as the viewer shows it: a file not here didn't */
  files: { file: string; changedLines: number[]; removals: RemovedBlock[] }[];
  findings: RoundFinding[];
}

/** A unit touched by a file's delta: a changed line, or a removal, inside what it shows. */
function unitTouched(unit: Unit, delta: FileDelta): boolean {
  const within = (line: number) => unit.ranges.some((range) => line >= range.start && line <= range.end);
  return (
    delta.changedLines.some(within) ||
    delta.removals.some((block) => within(block.afterLine) || within(block.afterLine + 1)) ||
    // a deleted unit shows no lines
    (unit.ranges.length === 0 && delta.oldLines.size > 0)
  );
}

function linesChanged(delta: FileDelta, first: number, last: number): boolean {
  for (let line = first; line <= last; line++) if (delta.oldLines.has(line)) return true;
  return false;
}

export function roundView(opts: {
  root: string;
  review: string;
  units: Unit[];
  /** Repo-relative path → the text this analysis read */
  sources: ReadonlyMap<string, string>;
  /** A repo-relative path as the viewer shows it */
  shown: (file: string) => string;
  sentChecks: Record<string, SentCheck> | undefined;
}): RoundView | null {
  const rounds = readRounds(opts.root, opts.review);
  const last = rounds.at(-1);
  if (!last) return null;
  const deltas = new Map<string, FileDelta>();
  for (const [file, text] of opts.sources) {
    const before = last.files[file];
    deltas.set(file, fileDelta(before ?? '', text));
  }
  const changedUnits = new Set(
    opts.units
      .filter((unit) => deltas.has(unit.file) && unitTouched(unit, deltas.get(unit.file)!))
      .map((unit) => unit.id),
  );
  const unitsById = new Map(opts.units.map((unit) => [unit.id, unit]));
  const findings = last.findings.map((finding): RoundFinding => {
    const claim = opts.sentChecks?.[finding.key];
    const claimed = claim && unitsById.get(claim.unit);
    const base = { ...finding, displayFile: opts.shown(finding.file) };
    if (claim && claimed && placedHash(claimed) === claim.hash) {
      return { ...base, state: claim.fixed ? 'fixed' : 'not-fixed', how: claim.how };
    }
    const delta = deltas.get(finding.file);
    // its file left the diff, or the code it was on did
    if (!delta) return { ...base, state: 'changed', how: null };
    if (finding.line !== null && linesChanged(delta, finding.line, finding.endLine ?? finding.line)) {
      return { ...base, state: 'changed', how: null };
    }
    // no unit and no line to check (a note on removed lines): all that can be said is of its file
    const moved = finding.unit
      ? changedUnits.has(finding.unit) || !unitsById.has(finding.unit)
      : finding.line === null && (delta.changedLines.length > 0 || delta.removals.length > 0);
    return { ...base, state: moved ? 'nearby' : 'untouched', how: null };
  });
  return {
    round: rounds.length + 1,
    sentAt: last.at,
    units: [...changedUnits],
    files: [...deltas]
      .filter(([, delta]) => delta.changedLines.length > 0 || delta.removals.length > 0)
      .map(([file, delta]) => ({
        file: opts.shown(file),
        changedLines: delta.changedLines,
        removals: delta.removals,
      })),
    findings,
  };
}
