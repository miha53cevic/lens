// The Summary list as an inbox (model/inbox.ts): its flows and Read areas opened and folded, a
// change read and the next one opened, and the motion of each.

import { commit, getState, type LensState, toggled } from '../store.ts';
import { listModel } from '../model/summaryList.ts';
import { type InboxFlow, inboxKeyOf } from '../model/inbox.ts';
import { type Unit, unitViewKey } from '../model/signals.ts';
import { flip, growClosed, growOpen, places, riseInEach, stay } from '../../ui/motion.ts';

function flowSection(key: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-inbox-flow="${CSS.escape(key)}"]`);
}
const flowBody = (key: string) =>
  flowSection(key)?.querySelector<HTMLElement>(':scope > [data-part="inbox-body"]') ?? null;
const readArea = (key: string) => flowSection(key)?.querySelector<HTMLElement>('[data-part="inbox-read"]') ?? null;
const cardsIn = (root: Element | null) =>
  root ? [...root.querySelectorAll<HTMLElement>('[data-part="inbox-card"]')] : [];
const cardKey = (card: HTMLElement) => card.dataset.inboxUnit;

function inboxFlow(state: LensState, key: string): InboxFlow | null {
  return listModel(state)?.inbox.find((flow) => flow.key === key) ?? null;
}

function setFlowOpen(key: string, open: boolean | null): void {
  commit((state) => {
    const flowOpen = new Map(state.inboxFlowOpen);
    if (open === null) flowOpen.delete(key);
    else flowOpen.set(key, open);
    return { inboxFlowOpen: flowOpen };
  });
}

/** A flow that just opened grows open, its cards rising in one after another. */
function playOpened(element: HTMLElement | null): void {
  growOpen(element);
  riseInEach(cardsIn(element));
}

/** A flow folds or unfolds; folding plays its opening back. */
export function toggleInboxFlow(key: string): void {
  const flow = inboxFlow(getState(), key);
  if (!flow) return;
  const body = flowBody(key);
  // clicked again while it folds: it stays open
  if (stay(body)) return;
  if (flow.open) return growClosed(body, () => setFlowOpen(key, false), cardsIn(body));
  setFlowOpen(key, true);
  playOpened(flowBody(key));
}

/** A flow's Read area opens or folds, the same way. */
export function toggleInboxRead(key: string): void {
  const change = () => commit((state) => ({ inboxReadOpen: toggled(state.inboxReadOpen, key) }));
  const area = readArea(key);
  if (stay(area)) return;
  if (getState().inboxReadOpen.has(key)) return growClosed(area, change, cardsIn(area));
  change();
  playOpened(readArea(key));
}

/**
 * A change opened in the inbox (j, k, the review pill, ⇧N, a cite): its flow unfolds when it was
 * folded, and its Read area when the card is in it, so its card is in sight. False when nothing
 * hid it: the caller opens it as usual.
 */
export function openInInbox(unitId: string): boolean {
  const flows = listModel(getState())?.inbox;
  const key = flows ? inboxKeyOf(flows, unitId) : null;
  const flow = key === null ? null : inboxFlow(getState(), key);
  if (key === null || !flow) return false;
  const inRead = !flow.readOpen && flow.read.some((unit) => unit.id === unitId);
  if (flow.open && !inRead) return false;
  commit((state) => ({
    summaryUnit: unitId,
    inboxFlowOpen: flow.open ? state.inboxFlowOpen : new Map(state.inboxFlowOpen).set(key, true),
    inboxReadOpen: inRead ? new Set(state.inboxReadOpen).add(key) : state.inboxReadOpen,
  }));
  playOpened(flow.open ? readArea(key) : flowBody(key));
  return true;
}

/**
 * What a filter matched, unfolded: each flow it left with a card, and its Read area when a match is
 * read. Folding them again is the reader's: lifting the filter leaves them as they are.
 */
export function revealMatches(state: LensState): Pick<LensState, 'inboxFlowOpen' | 'inboxReadOpen'> {
  const list = listModel(state);
  // a filter with nothing to match lifts itself: nothing to reveal
  if (!list || list.signal === null) return { inboxFlowOpen: state.inboxFlowOpen, inboxReadOpen: state.inboxReadOpen };
  const flowOpen = new Map(state.inboxFlowOpen);
  const readOpen = new Set(state.inboxReadOpen);
  for (const flow of list.inbox) {
    flowOpen.set(flow.key, true);
    if (flow.read.length > 0) readOpen.add(flow.key);
  }
  return { inboxFlowOpen: flowOpen, inboxReadOpen: readOpen };
}

export interface InboxMark {
  /** What the mark changes beside the mark itself, in the same commit */
  patch: Partial<LensState>;
  /** Runs once it's on screen: the cards slide, the flows fold and open */
  done: () => void;
}

/**
 * A change marked in the inbox (`m`, its Read button). Marked read, the next change to read after
 * it opens (then from the top; none left: the overview), its flow unfolding, and a flow with nothing
 * left to read folds once its last card has slid into Read. Null outside the Summary tab.
 */
export function inboxMark(state: LensState, unit: Unit, viewedUnits: ReadonlySet<string>): InboxMark | null {
  const list = listModel(state);
  if (!list || state.view !== 'summary') return null;
  const rail = document.querySelector<HTMLElement>('[data-part="inbox-rail"]');
  const before = places(cardsIn(rail), cardKey);
  const slide = () =>
    flip(cardsIn(rail), cardKey, before, rail?.querySelector<HTMLElement>('[data-part="inbox-ghosts"]') ?? null);
  if (!viewedUnits.has(unitViewKey(unit))) return { patch: {}, done: slide };

  const isRead = (unitId: string) => {
    const candidate = list.units.find((other) => other.id === unitId);
    return !candidate || viewedUnits.has(unitViewKey(candidate));
  };
  const at = list.order.indexOf(unit.id);
  const next = [...list.order.slice(at + 1), ...list.order.slice(0, Math.max(at, 0))].find((id) => !isRead(id)) ?? null;
  const key = inboxKeyOf(list.inbox, unit.id);
  const flow = key === null ? null : list.inbox.find((candidate) => candidate.key === key);
  const finished = !!flow && flow.toRead.every((other) => isRead(other.id));
  const nextKey = next === null ? null : inboxKeyOf(list.inbox, next);
  const nextFolded = nextKey !== null && list.inbox.find((candidate) => candidate.key === nextKey)?.open === false;

  const flowOpen = new Map(state.inboxFlowOpen);
  // held open a moment, so its last card is seen going into Read before the flow folds
  if (finished && key !== null) flowOpen.set(key, true);
  if (nextKey !== null) flowOpen.set(nextKey, true);
  return {
    patch: { summaryUnit: next, inboxFlowOpen: flowOpen },
    done: () => {
      slide();
      if (nextFolded) playOpened(flowBody(nextKey));
      if (finished && key !== null && key !== nextKey) {
        const body = flowBody(key);
        growClosed(body, () => setFlowOpen(key, null), cardsIn(body));
      }
    },
  };
}
