// Timings: while they're on (the ⋯ switch, or the config's), the viewer measures its own steps,
// each until the browser has painted what it changed, and posts them to the server, which keeps
// them with its own in .lens/timings.jsonl for `lens timings` (src/cli-app/timings.ts).

import type { TimingsRequest } from '../../cli-app/api/contract.ts';
import { getState, update } from '../store.ts';
import { api, noteDone, tracked } from './status.ts';

/** Steps are posted together, this long after the last one: a burst of keys is one request */
const POST_AFTER_MS = 1000;

// An outbox and its timer: nothing renders from them.
let outbox: TimingsRequest['timings'] = [];
let postTimer: ReturnType<typeof setTimeout> | null = null;

const noop = () => {};

/**
 * Starts measuring a step; call what it returns once the step's state is in. The step ends at the
 * paint after that: a frame, then the task after it, which runs once the frame is drawn.
 */
export function measure(name: string, detail?: string): () => void {
  if (!getState().data.timings) return noop;
  const start = performance.now();
  return () =>
    requestAnimationFrame(() =>
      setTimeout(() => {
        outbox.push({ name, ms: Math.round((performance.now() - start) * 10) / 10, ...(detail && { detail }) });
        if (postTimer) clearTimeout(postTimer);
        postTimer = setTimeout(post, POST_AFTER_MS);
      }),
    );
}

/** The page's first paint, from the request that loaded it: what the reader waited for. */
export function measureLoad(): void {
  if (!getState().data.timings) return;
  requestAnimationFrame(() =>
    setTimeout(() => {
      outbox.push({ name: 'load', ms: Math.round(performance.now()), detail: getState().data.files.length + ' files' });
      void post();
    }),
  );
}

function post(): Promise<void> {
  postTimer = null;
  const timings = outbox.splice(0, 100);
  if (timings.length === 0 || !getState().data.timings) return Promise.resolve();
  // a debugging aid: a post that fails loses those timings, and nothing else (the bar still
  // notices a server that stopped, through api)
  return api('POST /api/timings', { body: { timings } }).then(noop, noop);
}

/** The switch: lens records how long its steps take, for `lens timings`. */
export function setTimings(on: boolean): Promise<boolean> {
  return tracked({ id: 'timings', label: 'Saving Timings…', failed: "Couldn't save Timings" }, async () => {
    await api('POST /api/settings', { body: { timings: on } });
    if (!on) outbox = [];
    update((state) => ({ data: { ...state.data, timings: on } }));
    noteDone(on ? 'Timings on' : 'Timings off', on ? 'run lens timings to read them' : undefined);
  });
}
