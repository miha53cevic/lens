import { useMemo } from 'react';
import { useLens } from '../../../store.ts';
import { openConcernLines, type Unit } from '../../../model/signals.ts';
import { unitPlan } from '../../../model/plans.ts';
import { fileNotes } from '../../../model/notes.ts';
import { OverviewRuler } from '../../OverviewRuler.tsx';
import { useShownChanges } from './hooks.ts';

/** The unit's code's overview ruler: its changes and removed lines, its open concerns and the reader's notes for the agent. */
export function UnitRuler({ unit }: { unit: Unit }) {
  const { plan, concerns, notes } = useLens((state) => {
    const plan = unitPlan(state, unit);
    return {
      plan,
      concerns: openConcernLines(state.concernMarks, unit),
      notes: plan.file ? fileNotes(state.notes, plan.file).flagged : null,
    };
  });
  const flagged = useMemo(() => (notes?.size ? new Map([...notes, ...concerns]) : concerns), [notes, concerns]);
  const changedLines = useShownChanges(unit, plan);
  return <OverviewRuler path={unit.displayFile} items={plan.items} changedLines={changedLines} flagged={flagged} />;
}
