// The concerns the reader marked real, as text for the agent that will fix them.

import type { Concern } from '../../cli-app/summary/store.ts';
import { memo, plural } from '../shared.ts';
import { concernMark, type Marks, type Unit } from './signals.ts';

export interface RealConcerns {
  /** The confirmed concerns, in the summary's order */
  items: { unit: Unit; concern: Concern }[];
  /** How many units they are in */
  unitCount: number;
  /** Confirmed concerns left out: their unit's code changed since, so their lines may point elsewhere */
  stale: number;
  /** What the overview's button copies */
  text: string;
}

/** Where a concern sits, as the agent can open it: "N31" is a line of the file, "O16" one the diff removed. */
function concernPlace(unit: Unit, concern: Concern): string {
  const line = concern.line.slice(1);
  return concern.line.startsWith('O') ? `${unit.displayFile} (removed line ${line})` : `${unit.displayFile}:${line}`;
}

export const realConcerns = memo((units: readonly Unit[], marks: Marks): RealConcerns => {
  const items: RealConcerns['items'] = [];
  let stale = 0;
  for (const unit of units) {
    for (const concern of unit.summary?.concerns ?? []) {
      if (concernMark(marks, unit, concern) !== 'real') continue;
      if (unit.stale) stale++;
      else items.push({ unit, concern });
    }
  }
  const lines = [
    'Fix these review findings. Each was raised in a lens review and confirmed by the reviewer.',
    ...items.map(
      ({ unit, concern }, index) =>
        `\n${index + 1}. [${concern.kind}] ${concernPlace(unit, concern)} — ${unit.name}\n   ${concern.text}`,
    ),
  ];
  if (stale > 0) {
    lines.push(`\nLeft out: ${plural(stale, 'confirmed concern')} on code that changed since the summary was written.`);
  }
  return { items, unitCount: new Set(items.map((item) => item.unit.id)).size, stale, text: lines.join('\n') + '\n' };
});
