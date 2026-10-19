// The findings the reader marked real (concerns and callers it may break), as text for the agent that will fix them.

import { memo, plural } from '../shared.ts';
import { type Finding, findingMark, findings, type Marks, type Unit } from './signals.ts';

export interface RealConcerns {
  /** The confirmed findings, in the summary's order */
  items: { unit: Unit; finding: Finding }[];
  /** How many of them are concerns, and how many callers it may break */
  concernCount: number;
  breakCount: number;
  /** How many units they are in */
  unitCount: number;
  /** Confirmed findings left out: their unit's code changed since, so their lines may point elsewhere */
  stale: number;
  /** What the overview's button copies */
  text: string;
}

/** "1 concern and 2 possible breaks": what is confirmed, by kind, each word prefixed */
export function confirmedLabel(real: RealConcerns, prefix = ''): string {
  const parts = [];
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

export const realConcerns = memo((units: readonly Unit[], marks: Marks): RealConcerns => {
  const items: RealConcerns['items'] = [];
  let stale = 0;
  for (const unit of units) {
    for (const finding of findings(unit)) {
      if (findingMark(marks, finding) !== 'real') continue;
      if (unit.stale) stale++;
      else items.push({ unit, finding });
    }
  }
  const lines = [
    'Fix these review findings. Each was raised in a lens review and confirmed by the reviewer.',
    ...items.map(({ unit, finding }, index) => findingText(unit, finding, index)),
  ];
  if (stale > 0) {
    lines.push(`\nLeft out: ${plural(stale, 'confirmed finding')} on code that changed since the summary was written.`);
  }
  const breakCount = items.filter(({ finding }) => finding.kind === 'breaks').length;
  return {
    items,
    concernCount: items.length - breakCount,
    breakCount,
    unitCount: new Set(items.map((item) => item.unit.id)).size,
    stale,
    text: lines.join('\n') + '\n',
  };
});
