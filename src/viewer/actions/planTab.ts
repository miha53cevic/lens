// The Plan tab: reading the root's Lavish plans, and picking one, whose session Lavish then opens
// for the tab's frame. lens shows what the agent and Lavish do; it starts no agent itself.

import { getState, update } from '../store.ts';
import { pickedPlan } from '../model/planTab.ts';
import { api, tracked } from './status.ts';

/** The list as it is now; `quiet`: a poll found it changed, so the bar doesn't say it's loading */
export async function loadPlans(quiet = false): Promise<void> {
  const read = async () => {
    const list = await api('GET /api/plans');
    update((state) => ({ plan: { ...state.plan, list } }));
  };
  if (quiet) {
    // a failed poll says nothing: the next one tries again
    await read().catch(() => {});
    return;
  }
  await tracked({ id: 'plans', label: 'Reading the plans…', failed: "Couldn't read the plans" }, read);
}

/** A plan shown in the tab, or New plan (null). A plan with a session to go on opens in its frame. */
export function pickPlan(file: string | null): void {
  update((state) => ({
    plan: { ...state.plan, picked: file, frame: state.plan.frame?.file === file ? state.plan.frame : null },
  }));
  const plan = pickedPlan(getState());
  // one the reader ended in Lavish waits for them to reopen it (Lavish's rule: never uninvited)
  if (plan && !(plan.session?.status === 'ended' && plan.session.endedByUser)) void openPlan(plan.file, false);
}

/** Has Lavish open the plan's session (`reopen`: one the reader ended), and shows it in the frame. */
export async function openPlan(file: string, reopen: boolean): Promise<void> {
  const state = getState();
  if (state.plan.frame?.file === file && !reopen) return;
  if (!state.plan.list?.setup.cli) return;
  await tracked(
    { id: 'plan-open', label: 'Opening the plan in Lavish…', failed: "Couldn't open the plan" },
    async () => {
      const { url } = await api('POST /api/plans/open', { body: { file, reopen } });
      // the reader may have picked another while Lavish started
      if (getState().plan.picked !== file) return;
      update((now) => ({ plan: { ...now.plan, frame: { file, url } } }));
      // reopened: the list says so on the next read, not on the next poll
      if (reopen) await loadPlans(true);
    },
  );
}
