// The Summary tab's list: flows by priority, filters, the open unit and the page it shows.

import type { Flow } from '../../cli-app/summary/store.ts';
import type { SummaryView } from '../../cli-app/summary/view.ts';
import type { ReaderNote } from '../../cli-app/notes/store.ts';
import type { ViewerPayload } from '../../cli-app/render/web/server.ts';
import type { LensState, SignalFilter } from '../store.ts';
import { unitNoteKinds } from './notes.ts';
import { isTestFile, memo } from '../shared.ts';
import {
  flowPriority,
  hasDismissed,
  isFlagged,
  type Marks,
  type Unit,
  unitById,
  unitLabel,
  unitSignals,
} from './signals.ts';
import { type InboxFlow, inboxFlows, inboxOrder } from './inbox.ts';

interface Section {
  flow: Flow;
  order: number;
  members: Unit[];
}

/** The units in no flow from one file, under that file's name */
interface FileGroup {
  file: string;
  members: Unit[];
}

/** No verdicts: what the agent flagged */
const AGENT_FLAGS: Marks = new Map();

// List order: flows by priority (then by how many of their units the agent flagged),
// then the units in no flow: flagged, routine, not yet summarized / stale. The reader's
// verdicts don't reorder it: a dismiss mustn't move the list under the reader.
// A unit is in one flow (the server sees to it); should one list it twice, the first keeps it.
export function groupUnits(
  summary: SummaryView,
  shown: (unit: Unit) => boolean,
): { sections: Section[]; others: Unit[] } {
  const rank = (unit: Unit) => (!unit.summary ? 3 : isFlagged(AGENT_FLAGS, unit) ? 0 : 1);
  const flaggedCount = (members: Unit[]) => members.filter((unit) => isFlagged(AGENT_FLAGS, unit)).length;
  const inFlow = new Set<string>();
  const sections = summary.flows
    .map((flow, order) => {
      const all = Object.keys(flow.units)
        .filter((unitId) => !inFlow.has(unitId))
        .map((unitId) => unitById(summary, unitId))
        .filter((unit): unit is Unit => unit !== null);
      for (const unit of all) inFlow.add(unit.id);
      return { flow, order, members: all.filter(shown) };
    })
    .filter((section) => section.members.length > 0)
    .sort(
      (sectionA, sectionB) =>
        flowPriority(sectionA.flow) - flowPriority(sectionB.flow) ||
        flaggedCount(sectionB.members) - flaggedCount(sectionA.members) ||
        sectionA.order - sectionB.order,
    );
  const others = summary.units
    .filter((unit) => !inFlow.has(unit.id))
    .filter(shown)
    .sort((unitA, unitB) => rank(unitA) - rank(unitB));
  return { sections, others };
}

export interface ListModel {
  /** The units hide tests leaves */
  units: Unit[];
  counts: Record<NonNullable<SignalFilter>, number>;
  /** The signal filter in effect: one whose last unit went away (dismissed) lifts */
  signal: SignalFilter;
  /** The list as an inbox: each flow's changes as cards, the read ones folded under them */
  inbox: InboxFlow[];
  /** Unit ids in list order, as j/k walks them: what's visible (inboxOrder) */
  order: string[];
  /** The open unit: the reader's, or the first in the list */
  activeId: string | null;
  summarized: number;
  shownCount: number;
}

const buildList = memo(
  (
    summary: SummaryView,
    marks: Marks,
    hideTests: boolean,
    query: string,
    sumSignal: SignalFilter,
    summaryUnit: string | null,
    viewedUnits: ReadonlySet<string>,
    inboxFlowOpen: ReadonlyMap<string, boolean>,
    inboxReadOpen: ReadonlySet<string>,
    notes: readonly ReaderNote[],
    files: ViewerPayload['files'],
  ): ListModel => {
    const isShown = (unit: Unit) => !(hideTests && isTestFile(unit.displayFile));
    const units = summary.units.filter(isShown); // hide tests: the counts follow the list
    // the reader's own notes count with the agent's findings: a bug they noted is one to filter by
    const signalsOf = (unit: Unit) =>
      unitSignals(
        marks,
        unit,
        unitNoteKinds(notes, files.find((file) => file.file === unit.displayFile) ?? null, unit),
      );
    const counts = { any: 0, bug: 0, risk: 0, question: 0, breaks: 0, dismissed: 0 };
    for (const unit of units) {
      const signals = signalsOf(unit);
      if (signals.length > 0) counts.any++;
      for (const signal of signals) counts[signal]++;
      if (hasDismissed(marks, unit)) counts.dismissed++;
    }
    const signal = sumSignal !== null && counts[sumSignal] === 0 ? null : sumSignal;
    const text = query.trim().toLowerCase();
    // the open unit stays listed under a signal filter: dismissing its concern mustn't take it away
    const isOpenUnit = (unit: Unit) => unit.id === summaryUnit;
    const matches = (unit: Unit) => {
      if (!isShown(unit)) return false;
      const hasSignal =
        signal === null ||
        (signal === 'any'
          ? signalsOf(unit).length > 0
          : signal === 'dismissed'
            ? hasDismissed(marks, unit)
            : signalsOf(unit).includes(signal));
      if (!hasSignal && !isOpenUnit(unit)) return false;
      if (text === '') return true;
      const haystack = unitLabel(unit) + '\n' + unit.displayFile + '\n' + (unit.summary ? unit.summary.gist : '');
      return haystack.toLowerCase().includes(text);
    };
    const { sections, others } = groupUnits(summary, matches);
    // the changes in no flow are one more flow, after the flows
    const inbox = inboxFlows(
      [...sections, { flow: null, members: byFile(others).flatMap((group) => group.members) }],
      viewedUnits,
      inboxFlowOpen,
      inboxReadOpen,
    );
    const order = inboxOrder(inbox);
    // a unit the filter hides stays open in the pane
    const activeId = summaryUnit && unitById(summary, summaryUnit) ? summaryUnit : order[0] || null;
    const listed = [...sections.flatMap((section) => section.members), ...others];
    return {
      units,
      counts,
      signal,
      order,
      inbox,
      activeId,
      summarized: units.filter((unit) => unit.summary).length,
      shownCount: listed.length,
    };
  },
);

export function listModel(state: LensState): ListModel | null {
  const summary = state.data.summary;
  if (!summary) return null;
  return buildList(
    summary,
    state.concernMarks,
    state.hideTests,
    state.sumQuery,
    state.sumSignal,
    state.summaryUnit,
    state.viewedUnits,
    state.inboxFlowOpen,
    state.inboxReadOpen,
    state.notes,
    state.data.files,
  );
}

/** Units by file, in the order each file's first unit comes: a file's units then sit together. */
function byFile(units: Unit[]): FileGroup[] {
  const groups = new Map<string, Unit[]>();
  for (const unit of units) {
    const members = groups.get(unit.displayFile);
    if (members) members.push(unit);
    else groups.set(unit.displayFile, [unit]);
  }
  return [...groups].map(([file, members]) => ({ file, members }));
}

/** The open unit; null on the overview, where unit keys (o, m) do nothing. */
export function currentUnit(state: LensState): Unit | null {
  if (state.summaryUnit === null) return null;
  const list = listModel(state);
  return list ? unitById(state.data.summary, list.activeId) : null;
}

/** What the Summary pane shows: the overview (where the tab opens, summarized or not), or one change. */
export function summaryPage(state: LensState): 'overview' | 'unit' {
  return state.summaryUnit === null ? 'overview' : 'unit';
}
