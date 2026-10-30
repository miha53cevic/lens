// What the status bar reports: the slow actions under way, what the last one left (a failure,
// or a note that it's done), and whether the server still answers. Every action that talks to
// the server goes through here (`request` / `reach`, and `tracked` for the slow ones), so a new
// one shows in the bar without the bar knowing about it.

import type { ApiAnswer, ApiBody, ApiRoute } from '../../cli-app/api/contract.ts';
import { getState, update } from '../store.ts';

/** How long an action runs before the bar says so: a quick one doesn't blink in and out. */
const SHOW_AFTER_MS = 150;
/** How long a "done" note stays. A failure stays until it's dismissed or the next action starts. */
const DONE_FOR_MS = 4000;

// Timer handles: resources, not state.
const showTimers = new Map<string, ReturnType<typeof setTimeout>>();
let doneTimer: ReturnType<typeof setTimeout> | null = null;

/** A request that never reached the server: it has stopped (the bar says so until one gets through). */
export class ServerGone extends Error {
  constructor() {
    super('the lens server has stopped');
  }
}

/** fetch, noting whether the server is still there. Any status comes back as it is. */
export async function reach(url: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    if (!getState().serverGone) update({ serverGone: true });
    throw new ServerGone();
  }
  if (getState().serverGone) update({ serverGone: false });
  return response;
}

/** `reach`, with an error status thrown as the server's own reason (`{ error }`), when it gave one. */
export async function request(url: string, init?: RequestInit): Promise<Response> {
  const response = await reach(url, init);
  if (!response.ok) {
    let reason = 'http ' + response.status;
    try {
      reason = (await response.json()).error || reason;
    } catch {
      /* no JSON body: the status is all there is */
    }
    throw new Error(reason);
  }
  return response;
}

/** What a call of a route takes: its body when it has one, its `:id`, and any `?query` */
type ApiOptions<R extends ApiRoute> = (ApiBody<R> extends null ? { body?: undefined } : { body: ApiBody<R> }) &
  (R extends `${string}/:id${string}` ? { id: string } : { id?: undefined }) & { query?: Record<string, string> };

/**
 * A route of the server's API (cli-app/api/contract.ts), by its name: what it takes and what it
 * answers are typed by the contract. A `request` underneath, so it reports to the status bar the same way.
 */
export async function api<R extends ApiRoute>(
  route: R,
  ...[options]: {} extends ApiOptions<R> ? [options?: ApiOptions<R>] : [options: ApiOptions<R>]
): Promise<ApiAnswer<R>> {
  const [method, path] = route.split(' ');
  const { body, id, query } = (options ?? {}) as { body?: unknown; id?: string; query?: Record<string, string> };
  const url = path.replace(':id', encodeURIComponent(id ?? '')) + (query ? '?' + new URLSearchParams(query) : '');
  const init: RequestInit =
    body === undefined
      ? { method }
      : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  return (await request(url, init)).json();
}

function clearDoneTimer() {
  if (doneTimer) clearTimeout(doneTimer);
  doneTimer = null;
}

/** A slow action starts: its control can tell at once (`isBusy`), and the bar says so if it lasts. */
export function startActivity(id: string, label: string): void {
  clearDoneTimer();
  update((state) => ({
    // the last action's failure or note is over once another starts
    notice: null,
    activities: [...state.activities.filter((activity) => activity.id !== id), { id, label, shown: false }],
  }));
  clearTimeout(showTimers.get(id));
  showTimers.set(
    id,
    setTimeout(() => {
      showTimers.delete(id);
      update((state) => ({
        activities: state.activities.map((activity) => (activity.id === id ? { ...activity, shown: true } : activity)),
      }));
    }, SHOW_AFTER_MS),
  );
}

export function endActivity(id: string): void {
  clearTimeout(showTimers.get(id));
  showTimers.delete(id);
  update((state) => ({ activities: state.activities.filter((activity) => activity.id !== id) }));
}

/** The action didn't work: the bar says which and why, until it's dismissed or another action starts. */
export function noteFailure(label: string, detail?: string): void {
  clearDoneTimer();
  update({ notice: { kind: 'failed', label, detail } });
}

/** The action is done: the bar says what it did, for a moment. */
export function noteDone(label: string, detail?: string): void {
  clearDoneTimer();
  update({ notice: { kind: 'done', label, detail } });
  doneTimer = setTimeout(() => {
    doneTimer = null;
    if (getState().notice?.kind === 'done') update({ notice: null });
  }, DONE_FOR_MS);
}

export function dismissNotice(): void {
  clearDoneTimer();
  update({ notice: null });
}

export interface TrackedAction {
  /** What it is, as `isBusy` asks for it: 'theme', 'refresh' … */
  id: string;
  /** What the bar says while it runs: "Applying dracula…" */
  label: string;
  /** What the bar says if it fails: "Refresh failed" (the reason follows it) */
  failed: string;
}

/**
 * Runs a slow action for the bar: working while it runs, failed with its reason when it throws
 * (a stopped server shows as that instead). Resolves to whether it worked.
 */
export async function tracked(action: TrackedAction, work: () => Promise<void>): Promise<boolean> {
  startActivity(action.id, action.label);
  try {
    await work();
    return true;
  } catch (error) {
    console.error(action.failed + ':', error);
    if (!(error instanceof ServerGone)) noteFailure(action.failed, (error as Error).message);
    return false;
  } finally {
    endActivity(action.id);
  }
}

/** Retry on a stopped server: asks it anything; an answer clears the bar. */
export function retryServer(): Promise<boolean> {
  return tracked(
    { id: 'reconnect', label: 'Looking for the lens server…', failed: 'The server answered with an error' },
    async () => {
      await api('GET /api/stamp');
    },
  );
}
