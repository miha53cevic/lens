import { useLens } from '../../../store.ts';
import { openConcernLines, type Unit } from '../../../model/signals.ts';
import { unitPlan } from '../../../model/plans.ts';
import { OverviewRuler } from '../../OverviewRuler.tsx';
import { useShownChanges } from './hooks.ts';

/** The unit's code's overview ruler: its changes and removed lines, and its open concerns. */
export function UnitRuler({ unit }: { unit: Unit }) {
  const { plan, flagged } = useLens((state) => ({
    plan: unitPlan(state, unit),
    flagged: openConcernLines(state.concernMarks, unit),
  }));
  const changedLines = useShownChanges(unit, plan);
  return <OverviewRuler path={unit.displayFile} items={plan.items} changedLines={changedLines} flagged={flagged} />;
}
