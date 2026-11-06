// What the Plan tab shows, from the list as last read.

import type { PlanEntry } from '../../cli-app/api/contract.ts';
import type { LensState } from '../store.ts';

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

/** What the agent is told to go on with a plan nobody polls */
export function resumeCommand(plan: PlanEntry): string {
  return '/lavish continue the plan in ' + plan.file;
}
