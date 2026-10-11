import { useMemo } from 'react';
import { useLens } from '../../../store.ts';
import { openConcernLines, type Unit } from '../../../model/signals.ts';
import { unitPlan } from '../../../model/plans.ts';
import { OverviewRuler } from '../../OverviewRuler.tsx';

/** The unit's code's overview ruler: its changes and removed lines, and its open concerns. */
export function UnitRuler({ unit }: { unit: Unit }) {
  const { items, flagged } = useLens((state) => ({
    items: unitPlan(state, unit).items,
    flagged: openConcernLines(state.concernMarks, unit),
  }));
  const changedLines = useMemo(() => new Set(unit.changedLines), [unit]);
  return <OverviewRuler path={unit.displayFile} items={items} changedLines={changedLines} flagged={flagged} />;
}
