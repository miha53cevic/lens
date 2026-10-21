import { useMemo } from 'react';
import type { Unit } from '../../../model/signals.ts';
import type { UnitPlan } from '../../../model/plans.ts';

/** The lines the unit's code marks as changed: its own, or with Full units every change in its file. */
export function useShownChanges(unit: Unit, plan: UnitPlan): ReadonlySet<number> {
  const fileChanges = plan.full ? plan.file?.changedLines : undefined;
  return useMemo(() => new Set(fileChanges ?? unit.changedLines), [unit, fileChanges]);
}
