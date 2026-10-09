import type { Unit } from '../../../model/signals.ts';

/** File -> its units, in the order given. */
export function byFile(units: Unit[]): Map<string, Unit[]> {
  const files = new Map<string, Unit[]>();
  for (const unit of units) files.set(unit.displayFile, [...(files.get(unit.displayFile) || []), unit]);
  return files;
}
