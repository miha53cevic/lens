import type { Flow } from '../../../../cli-app/summary/store.ts';
import type { Unit } from '../../../model/signals.ts';

/**
 * The step headings inside a flow: unit id → the step that starts at it. Only for a flow
 * that walks through two steps or more: one step over every change says nothing.
 */
export function stepHeadings(flow: Flow, members: Unit[]): Map<string, string> {
  const headings = new Map<string, string>();
  const steps = new Set(members.map((unit) => flow.units[unit.id]).filter(Boolean));
  if (steps.size < 2) return headings;
  members.forEach((unit, index) => {
    const step = flow.units[unit.id];
    if (step && step !== flow.units[members[index - 1]?.id]) headings.set(unit.id, step);
  });
  return headings;
}
