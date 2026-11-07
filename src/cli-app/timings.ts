import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { lensDir } from './summary/store.ts';

// Timings, for debugging slowness: with the `timings` switch on (the config, or the viewer's ⋯),
// the CLI, the server and the viewer each record how long their steps took, one JSON line each, in
// .lens/timings.jsonl. `lens timings` reads them back. Off, nothing is written and a step costs one
// check.

export type TimingSide = 'cli' | 'server' | 'viewer';

export interface Timing {
  /** ISO time the step ended */
  at: string;
  /** The process that recorded it (its pid and start), so one run's steps read together */
  run: string;
  side: TimingSide;
  name: string;
  ms: number;
  /** What the step worked on: files, characters, a theme */
  detail?: string;
}

export const TIMINGS_PATH = join('.lens', 'timings.jsonl');
/** Past this the file is cut to its newer half: it is for the last few runs, not a history */
const MAX_BYTES = 2_000_000;
/** What waits before the analysis says whether timings are on: a start's steps are a dozen */
const PENDING_MAX = 200;
/** How many of the last run's steps `lens timings` lists in order */
const LAST_RUN_STEPS = 40;

const RUN = process.pid + '@' + new Date().toISOString();
/** Where steps go: the repository's root while timings are on, else null */
let sink: string | null = null;
/**
 * The steps recorded before anything said whether timings are on (the CLI's start, before its
 * analysis has read the settings): written once `setTimings` turns them on, else dropped.
 */
let pending: Timing[] | null = [];

/** Timings on or off for the repository at `root`, from the analysis's switch (timingsOn). */
export function setTimings(root: string, on: boolean): void {
  sink = on ? root : null;
  if (pending && on) write(root, pending);
  pending = null;
}

/** Records a step that took `ms`; nothing when timings are off. */
export function record(side: TimingSide, name: string, ms: number, detail?: string): void {
  if (sink === null && pending === null) return;
  const timing: Timing = { at: new Date().toISOString(), run: RUN, side, name, ms: Math.round(ms * 10) / 10 };
  if (detail) timing.detail = detail;
  if (sink !== null) write(sink, [timing]);
  else if (pending && pending.length < PENDING_MAX) pending.push(timing);
}

/**
 * Runs `work` and records how long it took (until its promise settles, when it returns one). The
 * detail is asked only when the step is recorded.
 */
export function timed<T>(side: TimingSide, name: string, work: () => T, detail?: () => string): T {
  if (sink === null && pending === null) return work();
  const start = performance.now();
  const done = () => record(side, name, performance.now() - start, detail?.());
  const result = work();
  if (result instanceof Promise) {
    result.then(done, done);
    return result;
  }
  done();
  return result;
}

/** Since this process started: the CLI's "ready" */
export function sinceStart(): number {
  return performance.now();
}

function write(root: string, timings: Timing[]): void {
  try {
    lensDir(root);
    const path = join(root, TIMINGS_PATH);
    appendFileSync(path, timings.map((timing) => JSON.stringify(timing) + '\n').join(''));
    if (statSync(path).size > MAX_BYTES) {
      const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
      writeFileSync(path, lines.slice(Math.floor(lines.length / 2)).join('\n') + '\n');
    }
  } catch {
    // a debugging aid never fails what it measures (a folder gone, a disk full)
  }
}

export function readTimings(root: string): Timing[] {
  const path = join(root, TIMINGS_PATH);
  if (!existsSync(path)) return [];
  const timings: Timing[] = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line) continue;
    try {
      const timing = JSON.parse(line);
      if (typeof timing?.name === 'string' && typeof timing.ms === 'number') timings.push(timing);
    } catch {
      // a line cut by a crash mid-write
    }
  }
  return timings;
}

/** One step across the timings read: how often, and how long */
export interface TimingStat {
  side: TimingSide;
  name: string;
  count: number;
  median: number;
  max: number;
  last: number;
  lastDetail: string | null;
}

/** Each step's stats, in the order each first appears */
export function timingStats(timings: Timing[]): TimingStat[] {
  const steps = new Map<string, Timing[]>();
  for (const timing of timings) {
    const key = timing.side + ' ' + timing.name;
    const list = steps.get(key);
    if (list) list.push(timing);
    else steps.set(key, [timing]);
  }
  return [...steps.values()].map((list) => {
    const sorted = list.map((timing) => timing.ms).sort((a, b) => a - b);
    const last = list[list.length - 1];
    return {
      side: last.side,
      name: last.name,
      count: list.length,
      median: sorted[Math.floor((sorted.length - 1) / 2)],
      max: sorted[sorted.length - 1],
      last: last.ms,
      lastDetail: last.detail ?? null,
    };
  });
}

/**
 * `lens timings`: each step's count, median, max and last, then the last run's steps in order.
 * `--json` prints the timings as kept.
 */
export function runTimings(root: string, json: boolean, timingsSwitch: boolean): void {
  const timings = readTimings(root);
  if (json) {
    console.log(JSON.stringify(timings, null, 2));
    return;
  }
  if (timings.length === 0) {
    console.log(
      timingsSwitch
        ? 'no timings yet: open or refresh a review'
        : 'no timings: turn them on in the viewer (⋯ → Timings) or with "timings": true in .lens.json',
    );
    return;
  }
  const ms = (value: number) => (value < 10 ? value.toFixed(1) : String(Math.round(value))) + ' ms';
  const table = (rows: string[][]) => {
    const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
    return rows.map((row) =>
      row
        // numbers line up on the right
        .map((cell, column) =>
          /^[\d.]+( ms)?$/.test(cell) ? cell.padStart(widths[column]) : cell.padEnd(widths[column]),
        )
        .join('  ')
        .trimEnd(),
    );
  };
  console.log(`${timings.length} timings in ${TIMINGS_PATH}${timingsSwitch ? '' : ' (timings are off now)'}\n`);
  const stats = timingStats(timings);
  for (const line of table([
    ['step', 'count', 'median', 'max', 'last', 'last detail'],
    ...stats.map((stat) => [
      stat.side + ' ' + stat.name,
      String(stat.count),
      ms(stat.median),
      ms(stat.max),
      ms(stat.last),
      stat.lastDetail ?? '',
    ]),
  ]))
    console.log(line);
  const lastRun = timings[timings.length - 1].run;
  // the last steps of it: a viewer left open polls for hours
  const steps = timings.filter((timing) => timing.run === lastRun).slice(-LAST_RUN_STEPS);
  console.log(`\nthe last run (${lastRun}), its last ${steps.length} steps in order:\n`);
  for (const line of table(
    steps.map((timing) => [
      timing.at.slice(11, 23),
      timing.side + ' ' + timing.name,
      ms(timing.ms),
      timing.detail ?? '',
    ]),
  ))
    console.log(line);
}
