// The Summary tab's list: flows by priority, filters, the open unit and the page it shows.

import type { Flow } from '../../../../summary/store.ts';
import type { SummaryView } from '../../../../summary/view.ts';
import type { LensState, SignalFilter } from '../store.ts';
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

export interface Section {
  flow: Flow;
  order: number;
  members: Unit[];
}

/** No verdicts: what the agent flagged */
const AGENT_FLAGS: Marks = new Map();

// List order: flows by priority (then by how many of their units the agent flagged),
// then the units in no flow: flagged, routine, not yet summarized / stale. The reader's
// verdicts don't reorder it: a dismiss mustn't move the list under the reader.
// A unit in several flows is listed under each.
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
  sections: Section[];
  others: Unit[];
  folded: Set<string>;
  /** Unit ids as j/k walks them: what's visible, each unit once */
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
    flowOpen: ReadonlyMap<string, boolean>,
    summaryUnit: string | null,
  ): ListModel => {
    const isShown = (unit: Unit) => !(hideTests && isTestFile(unit.displayFile));
    const units = summary.units.filter(isShown); // hide tests: the counts follow the list
    const counts = { any: 0, bug: 0, risk: 0, question: 0, breaks: 0, look: 0, dismissed: 0 };
    for (const unit of units) {
      const signals = unitSignals(marks, unit);
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
          ? isFlagged(marks, unit)
          : signal === 'dismissed'
            ? hasDismissed(marks, unit)
            : unitSignals(marks, unit).includes(signal));
      if (!hasSignal && !isOpenUnit(unit)) return false;
      if (text === '') return true;
      const haystack = unitLabel(unit) + '\n' + unit.displayFile + '\n' + (unit.summary ? unit.summary.gist : '');
      return haystack.toLowerCase().includes(text);
    };
    const { sections, others } = groupUnits(summary, matches);
    // P3 flows start folded; a click on the flow's title flips it. A filter, or the open unit sitting inside, unfolds it.
    const isFolded = (section: Section) => {
      if (text !== '' || signal !== null) return false;
      const explicit = flowOpen.get(section.flow.title);
      if (explicit !== undefined) return !explicit;
      const holdsOpenUnit = section.members.some(isOpenUnit);
      return flowPriority(section.flow) === 3 && !holdsOpenUnit;
    };
    const folded = new Set(sections.filter(isFolded).map((section) => section.flow.title));
    const visibleMembers = sections
      .filter((section) => !folded.has(section.flow.title))
      .flatMap((section) => section.members);
    const order = [...new Set([...visibleMembers, ...others].map((unit) => unit.id))];
    // a unit the filter hides stays open in the pane
    const activeId = summaryUnit && unitById(summary, summaryUnit) ? summaryUnit : order[0] || null;
    const listed = [...sections.flatMap((section) => section.members), ...others];
    return {
      units,
      counts,
      signal,
      sections,
      others,
      folded,
      order,
      activeId,
      summarized: units.filter((unit) => unit.summary).length,
      shownCount: new Set(listed.map((unit) => unit.id)).size,
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
    state.flowOpen,
    state.summaryUnit,
  );
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
