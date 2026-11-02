// A round: findings handed to the agent keep the code as it is then (the server's rounds/), and the
// next read can show only what changed since. That read is the whole page's: `data` holds the
// change since, the whole change waits in `beforeRound`, and both views render from `data` as ever.
// Something that changes the page's data changes the whole change (`changeData`): `data` follows.

import type { SentFinding } from '../../cli-app/rounds/store.ts';
import type { RoundView } from '../../cli-app/rounds/view.ts';
import { getState, update, wholeData, type LensState } from '../store.ts';
import { isConcern } from '../model/signals.ts';
import type { RealConcerns } from '../model/realConcerns.ts';
import { api, tracked } from './status.ts';

/** What goes along with a handoff: what the reader confirmed and what they wrote, each with its place. */
export function sentFindings(real: RealConcerns): SentFinding[] {
  return [
    ...real.items.map(({ unit, finding }): SentFinding => {
      const label = isConcern(finding) ? finding.concern.line : '';
      return {
        key: finding.key,
        kind: finding.kind,
        text: finding.text,
        unit: unit.id,
        file: unit.displayFile,
        line: label.startsWith('N') ? Number(label.slice(1)) : null,
      };
    }),
    ...real.notes.map((note): SentFinding => ({
      key: 'note:' + note.id,
      kind: note.kind,
      text: note.text,
      unit: null,
      file: note.file,
      line: note.side === 'old' ? null : note.start,
      ...(note.side === 'old' ? {} : { endLine: note.end }),
    })),
  ];
}

/** Keeps this round. The handoff already happened, so failing it only says so. */
export function sendRound(findings: SentFinding[]): Promise<boolean> {
  if (findings.length === 0) return Promise.resolve(false);
  return tracked({ id: 'round', label: 'Keeping this round…', failed: "Couldn't keep this round" }, async () => {
    const { round } = await api('POST /api/rounds', { body: { findings } });
    update((state) => {
      const whole = wholeData(state);
      return {
        beforeRound: null,
        data: whole.summary ? { ...whole, summary: { ...whole.summary, round } } : whole,
      };
    });
  });
}

/** The page's data with only what changed since the round: the rows, the tree and the list follow it. */
function sinceRound(data: LensState['data'], round: RoundView): LensState['data'] {
  const byFile = new Map(round.files.map((file) => [file.file, file]));
  const changedUnits = new Set(round.units);
  return {
    ...data,
    files: data.files.map((file) => {
      const delta = byFile.get(file.file);
      // removedTokens are by the file's blocks: these have none, and draw plain
      return { ...file, changedLines: delta?.changedLines ?? [], removals: delta?.removals ?? [], removedTokens: [] };
    }),
    summary: data.summary && {
      ...data.summary,
      units: data.summary.units
        .filter((unit) => changedUnits.has(unit.id))
        .map((unit) => {
          const delta = byFile.get(unit.displayFile);
          const within = (line: number) => unit.ranges.some((range) => line >= range.start && line <= range.end);
          return {
            ...unit,
            changedLines: (delta?.changedLines ?? []).filter(within),
            removals: (delta?.removals ?? [])
              .filter((block) => within(block.afterLine) || within(block.afterLine + 1))
              .map((block) => ({ ...block, anchor: block.afterLine })),
          };
        }),
    },
  };
}

/** A change to the page's data that isn't a new analysis (a theme, a switch), made to the whole change. */
export function changeData(
  state: LensState,
  change: (whole: LensState['data']) => LensState['data'],
): Pick<LensState, 'data' | 'beforeRound'> {
  const whole = change(wholeData(state));
  const round = whole.summary?.round;
  return state.beforeRound && round
    ? { beforeRound: whole, data: sinceRound(whole, round) }
    : { data: whole, beforeRound: null };
}

/** Out of the since read, staying where the reader is: the open unit is in the whole change too. */
export function showWholeChange(): void {
  const { beforeRound } = getState();
  if (beforeRound) update({ data: beforeRound, beforeRound: null });
}

export function setSinceRound(on: boolean): void {
  const state = getState();
  const round = wholeData(state).summary?.round;
  if (on && round && !state.beforeRound) {
    update({ beforeRound: state.data, data: sinceRound(state.data, round), summaryUnit: null });
  } else if (!on && state.beforeRound) {
    update({ data: state.beforeRound, beforeRound: null, summaryUnit: null });
  }
}
