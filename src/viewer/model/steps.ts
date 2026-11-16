// A flow's steps (the layer each of its changes is in): the headings over its cards and the rail
// they hang on. No DOM and no store, so test/viewer.test.ts tests it directly.

import type { Flow } from '../../cli-app/summary/store.ts';

/** What a card needs here: its unit's id */
interface Card {
  id: string;
}

/** A flow's cards, as model/inbox.ts's InboxFlow holds them */
interface FlowCards<U extends Card = Card> {
  flow: Flow | null;
  toRead: readonly U[];
  read: readonly U[];
}

/**
 * The step headings over a flow's cards to read: unit id → the step that starts at it. Only for a
 * flow that walks through two steps or more (read cards count): one step over every change says nothing.
 */
export function stepHeadings({ flow, toRead, read }: FlowCards): Map<string, string> {
  const headings = new Map<string, string>();
  if (!flow) return headings;
  const steps = new Set([...toRead, ...read].map((unit) => flow.units[unit.id]).filter(Boolean));
  if (steps.size < 2) return headings;
  toRead.forEach((unit, index) => {
    const step = flow.units[unit.id];
    if (step && step !== flow.units[toRead[index - 1]?.id]) headings.set(unit.id, step);
  });
  return headings;
}

/**
 * A flow's steps in its order (its units' order), each done once every change in it is read: the
 * rail its cards hang on. Empty for a flow with under two steps, as stepHeadings.
 */
export function flowSteps({ flow, toRead, read }: FlowCards): { name: string; done: boolean }[] {
  if (!flow) return [];
  const present = new Set([...toRead, ...read].map((unit) => unit.id));
  const unread = new Set(toRead.map((unit) => flow.units[unit.id]));
  const names = [
    ...new Set(
      Object.entries(flow.units)
        .filter(([id, step]) => present.has(id) && step)
        .map(([, step]) => step),
    ),
  ];
  return names.length < 2 ? [] : names.map((name) => ({ name, done: !unread.has(name) }));
}

/** What an open flow draws, in order: its cards to read, and its steps' nodes when it has a rail. */
export type RailEntry<U extends Card> = { kind: 'unit'; unit: U } | { kind: 'step'; name: string; done: boolean };

/**
 * The cards to read, in their order, with a node where each step starts (stepHeadings) and the done
 * steps' nodes where they fall in the flow's order: those have no card left to stand over.
 */
export function railEntries<U extends Card>(inbox: FlowCards<U>): RailEntry<U>[] {
  const steps = flowSteps(inbox);
  const headings = stepHeadings(inbox);
  const index = new Map(steps.map((step, at) => [step.name, at]));
  const entries: RailEntry<U>[] = [];
  let drawn = 0;
  const doneUpTo = (end: number) => {
    for (; drawn < end; drawn++) if (steps[drawn].done) entries.push({ kind: 'step', ...steps[drawn] });
  };
  for (const unit of inbox.toRead) {
    const heading = headings.get(unit.id);
    if (heading !== undefined) {
      const at = index.get(heading)!;
      doneUpTo(at);
      entries.push({ kind: 'step', name: heading, done: false });
      drawn = Math.max(drawn, at + 1);
    }
    entries.push({ kind: 'unit', unit });
  }
  doneUpTo(steps.length);
  return entries;
}
