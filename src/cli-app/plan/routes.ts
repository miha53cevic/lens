import type { PlanOpenRequest, PlansResponse } from '../api/contract.ts';
import { createRouter, HttpError, noBody, type Router } from '../api/router.ts';
import { hostEnv, lavishListeners, lavishOrigin, lavishSetup, openLavish, type LavishEnv } from './lavish.ts';
import { isListedPlan, planSession, plansStamp, readPlans } from './plans.ts';
import type { PlanProxy } from './proxy.ts';

// The Plan tab on the viewer server:
//   GET  /api/plans        the root's plans, and whether Lavish is set up
//   POST /api/plans/open   a plan's session, opened, as the URL the tab's frame loads (through the proxy)

/** What cmd reads as its own: a Windows .cmd shim can't be handed such a name (lavish.ts) */
const CMD_SPECIAL = /[&|<>^%"!]/;

function parseOpen(body: unknown): PlanOpenRequest | { error: string } {
  const { file, reopen } = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (typeof file !== 'string' || !file) return { error: 'name the plan' };
  if (reopen !== undefined && typeof reopen !== 'boolean') return { error: 'reopen must be true or false' };
  return { file, reopen: reopen === true };
}

/** What GET /api/plans answers; /api/stamp?plans carries its `stamp` */
export async function plansNow(root: string, lavishEnv: LavishEnv): Promise<PlansResponse> {
  const shown = { setup: lavishSetup(root, lavishEnv), plans: await readPlans(root, lavishEnv) };
  return { ...shown, stamp: plansStamp(shown) };
}

export function createPlanRoutes(root: () => string, proxy: PlanProxy, lavishEnv: LavishEnv = hostEnv()): Router {
  return createRouter()
    .json('GET /api/plans', noBody, () => plansNow(root(), lavishEnv))
    .json('POST /api/plans/open', parseOpen, async ({ file, reopen }) => {
      const at = root();
      if (!isListedPlan(at, file)) throw new HttpError(404, `${file} isn't one of this repository's plans`);
      if (lavishEnv.platform === 'win32' && CMD_SPECIAL.test(file)) {
        throw new HttpError(400, `Lavish can't be handed ${file} on Windows: rename it`);
      }
      // a session that's open on a server that answers is shown as it is; anything else goes through Lavish's CLI
      const known = planSession(at, file, lavishEnv);
      const live =
        known &&
        known.status === 'open' &&
        !reopen &&
        (await lavishListeners(lavishOrigin(known.url, lavishEnv))) !== null;
      let opened: { url: string; key: string };
      if (live) opened = { url: known.url, key: known.key };
      else {
        if (!lavishSetup(at, lavishEnv).cli) throw new HttpError(409, 'Lavish is not set up');
        try {
          opened = await openLavish(at, file, reopen, lavishEnv);
        } catch (err) {
          throw new HttpError(502, (err as Error).message);
        }
      }
      proxy.admit(opened.key, lavishOrigin(opened.url, lavishEnv));
      return { url: `${proxy.origin}/session/${encodeURIComponent(opened.key)}` };
    });
}
