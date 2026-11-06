// What the Plan tab shows, from the list as last read.

import type { PlanEntry } from '../../cli-app/api/contract.ts';
import type { LensState, PlanFilter } from '../store.ts';
import { memo } from '../shared.ts';

/** The plan picked, as the list has it; null: New plan, or one the list no longer has */
export function pickedPlan(state: LensState): PlanEntry | null {
  const { list, picked } = state.plan;
  return (picked && list?.plans.find((plan) => plan.file === picked)) || null;
}

/** Lavish can open plans here: the CLI runs. Without the skill the agent can't write one, but they still open. */
export function lavishRuns(state: LensState): boolean {
  return !!state.plan.list?.setup.cli;
}

/** What a plan is called in the list: its <title>, else its file's name */
export function planName(plan: PlanEntry): string {
  return plan.title || plan.file.slice(plan.file.lastIndexOf('/') + 1);
}

const IN_FILTER: Record<PlanFilter, (plan: PlanEntry) => boolean> = {
  all: () => true,
  active: (plan) => plan.session?.status === 'open',
  pending: (plan) => (plan.session?.pending ?? 0) > 0,
};

const listModel = memo((plans: readonly PlanEntry[] | null, query: string, filter: PlanFilter) => {
  const needle = query.trim().toLowerCase();
  const found = (plans ?? []).filter(
    (plan) => !needle || planName(plan).toLowerCase().includes(needle) || plan.file.toLowerCase().includes(needle),
  );
  const counts = {
    all: found.length,
    active: found.filter(IN_FILTER.active).length,
    pending: found.filter(IN_FILTER.pending).length,
  };
  return { plans: plans && found.filter(IN_FILTER[filter]), counts };
});

/** The sidebar's plans, the filter box's and the segments' matches; `plans` null while the list is read. The counts follow the box. */
export function planListModel(state: LensState): {
  plans: PlanEntry[] | null;
  counts: Record<PlanFilter, number>;
} {
  return listModel(state.plan.list?.plans ?? null, state.plan.query, state.plan.filter);
}

/**
 * Said after every command the tab hands the agent: run as it usually is, Lavish opens a browser
 * tab of its own, and the plan is read here, in the Plan tab, instead.
 */
const NO_BROWSER = " Open it with lavish-axi's --no-open: I'm reviewing it in lens.";

/** What New plan copies: the reader's request as a /lavish command */
export function newPlanCommand(request: string): string {
  const asked = request
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.\s]+$/, '');
  return '/lavish ' + (asked || '<what to plan>') + '.' + NO_BROWSER;
}

/** What the agent is told to go on with a plan nobody polls */
export function resumeCommand(plan: PlanEntry): string {
  return '/lavish continue the plan in ' + plan.file + '.' + NO_BROWSER;
}
