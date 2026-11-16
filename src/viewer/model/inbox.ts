// The Summary list as an inbox: each flow's changes as cards, those still to read first and the
// read ones under them, folded. A flow is open while it has a change to read, unless the reader or a
// step said otherwise (inboxFlowOpen).

import type { Flow } from '../../cli-app/summary/store.ts';
import { type Unit, unitViewKey } from './signals.ts';

/** The key of the changes in no flow, which the inbox holds as one more flow */
export const NO_FLOW = '';

export interface InboxFlow {
  /** The flow's title; NO_FLOW for the changes in no flow */
  key: string;
  /** null for the changes in no flow */
  flow: Flow | null;
  toRead: Unit[];
  read: Unit[];
  open: boolean;
  readOpen: boolean;
}

/** The flows in the list's order, each with what's left to read and what's read. */
export function inboxFlows(
  groups: { flow: Flow | null; members: Unit[] }[],
  viewedUnits: ReadonlySet<string>,
  flowOpen: ReadonlyMap<string, boolean>,
  readOpen: ReadonlySet<string>,
): InboxFlow[] {
  return groups
    .filter((group) => group.members.length > 0)
    .map(({ flow, members }) => {
      const key = flow ? flow.title : NO_FLOW;
      const isRead = (unit: Unit) => viewedUnits.has(unitViewKey(unit));
      const toRead = members.filter((unit) => !isRead(unit));
      return {
        key,
        flow,
        toRead,
        read: members.filter(isRead),
        open: flowOpen.get(key) ?? toRead.length > 0,
        readOpen: readOpen.has(key),
      };
    });
}

/**
 * What j and k walk: every change still to read, a folded flow's too (stepping into it opens it),
 * and the read ones where their Read area is open.
 */
export function inboxOrder(flows: InboxFlow[]): string[] {
  return flows
    .flatMap((flow) => [...flow.toRead, ...(flow.open && flow.readOpen ? flow.read : [])])
    .map((unit) => unit.id);
}

/** The key of the flow a unit is in. */
export function inboxKeyOf(flows: InboxFlow[], unitId: string): string | null {
  const flow = flows.find((candidate) => [...candidate.toRead, ...candidate.read].some((unit) => unit.id === unitId));
  return flow ? flow.key : null;
}
