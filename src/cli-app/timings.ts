import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { basename, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import manifest from '../../package.json' with { type: 'json' };
import { lensHome } from './summary/settings.ts';

// Timings, for debugging slowness: with the `timings` switch on (the config, or the viewer's ⋯),
// the CLI, the server and the viewer each record how long their steps took, one JSON line each, in
// the machine's ~/.lens/timings.jsonl, whatever the repository: the file is what the reader hands
// over to have lens's speed looked at. Each run starts with a line about the machine. `lens timings`
// reads them back. Off, nothing is written and a step costs one check.

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
  /** The repository's folder name: one file holds every repository's runs */
  repo?: string;
}

/** What a run ran on: the first line of each run, so runs from different machines compare */
export interface TimingHost {
  at: string;
  run: string;
  host: { os: string; arch: string; cpu: string; cores: number; memoryGb: number; bun: string; lens: string };
}

export function timingsPath(): string {
  return join(lensHome(), 'timings.jsonl');
}
/** Past this the file is cut to its newer half: it is for the last runs of every repository, not a history */
const MAX_BYTES = 10_000_000;
/** What waits before the analysis says whether timings are on: a start's steps are a dozen */
const PENDING_MAX = 200;
/** How many of the last run's steps `lens timings` lists in order */
const LAST_RUN_STEPS = 40;

const RUN = process.pid + '@' + new Date().toISOString();
/** The repository steps are recorded for while timings are on (its folder name), else null */
let sink: string | null = null;
/** The file this run's host line went to: again when that's another file, or it was cleared */
let hostWrittenTo: string | null = null;
/**
 * The steps recorded before anything said whether timings are on (the CLI's start, before its
 * analysis has read the settings): written once `setTimings` turns them on, else dropped.
 */
let pending: Timing[] | null = [];

/** Timings on or off for the repository at `root`, from the analysis's switch (timingsOn). */
export function setTimings(root: string, on: boolean): void {
  sink = on ? basename(root) : null;
  if (pending && sink !== null) write(pending.map((timing) => ({ ...timing, repo: sink! })));
  pending = null;
}

/** Records a step that took `ms`; nothing when timings are off. */
export function record(side: TimingSide, name: string, ms: number, detail?: string): void {
  if (sink === null && pending === null) return;
  const timing: Timing = { at: new Date().toISOString(), run: RUN, side, name, ms: Math.round(ms * 10) / 10 };
  if (detail) timing.detail = detail;
  if (sink !== null) write([{ ...timing, repo: sink }]);
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

function hostLine(): TimingHost {
  return {
    at: new Date().toISOString(),
    run: RUN,
    host: {
      os: platform() + ' ' + release(),
      arch: arch(),
      cpu: cpus()[0]?.model.trim() ?? 'unknown',
      cores: cpus().length,
      memoryGb: Math.round(totalmem() / 2 ** 30),
      bun: process.versions.bun ?? 'none',
      lens: manifest.version,
    },
  };
}

function write(timings: Timing[]): void {
  if (timings.length === 0) return;
  try {
    mkdirSync(lensHome(), { recursive: true });
    const path = timingsPath();
    const lines: (Timing | TimingHost)[] =
      hostWrittenTo === path && existsSync(path) ? timings : [hostLine(), ...timings];
    hostWrittenTo = path;
    appendFileSync(path, lines.map((line) => JSON.stringify(line) + '\n').join(''));
    if (statSync(path).size > MAX_BYTES) {
      const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
      writeFileSync(path, lines.slice(Math.floor(lines.length / 2)).join('\n') + '\n');
    }
  } catch {
    // a debugging aid never fails what it measures (a folder gone, a disk full)
  }
}

export function readTimings(): { timings: Timing[]; hosts: TimingHost[] } {
  const path = timingsPath();
  const timings: Timing[] = [];
  const hosts: TimingHost[] = [];
  if (!existsSync(path)) return { timings, hosts };
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line) continue;
    try {
      const entry = JSON.parse(line);
      if (typeof entry?.name === 'string' && typeof entry.ms === 'number') timings.push(entry);
      else if (entry?.host && typeof entry.run === 'string') hosts.push(entry);
    } catch {
      // a line cut by a crash mid-write
    }
  }
  return { timings, hosts };
}

/** One step across the timings read: how often, and how long */
export interface TimingStat {
  repo: string;
  side: TimingSide;
  name: string;
  count: number;
  median: number;
  max: number;
  last: number;
  lastDetail: string | null;
}

/** Each step's stats, per repository (one repository's files aren't another's), in the order each first appears */
export function timingStats(timings: Timing[]): TimingStat[] {
  const steps = new Map<string, Timing[]>();
  for (const timing of timings) {
    const key = (timing.repo ?? '') + ' ' + timing.side + ' ' + timing.name;
    const list = steps.get(key);
    if (list) list.push(timing);
    else steps.set(key, [timing]);
  }
  return [...steps.values()].map((list) => {
    const sorted = list.map((timing) => timing.ms).sort((a, b) => a - b);
    const last = list[list.length - 1];
    return {
      repo: last.repo ?? '',
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
 * `lens timings`: each step's count, median, max and last, per repository, then the last run's
 * machine and its steps in order. `--repo <name>` keeps one repository's; `--json` prints them as kept.
 */
export function runTimings(args: string[], json: boolean, timingsSwitch: boolean): void {
  const repoAt = args.indexOf('--repo');
  const repo = repoAt === -1 ? null : (args[repoAt + 1] ?? null);
  if (repoAt !== -1 && repo === null) throw new Error('--repo needs a repository name');
  const read = readTimings();
  const timings = repo === null ? read.timings : read.timings.filter((timing) => timing.repo === repo);
  const runs = new Set(timings.map((timing) => timing.run));
  const hosts = read.hosts.filter((host) => runs.has(host.run));
  if (json) {
    console.log(JSON.stringify({ hosts, timings }, null, 2));
    return;
  }
  if (timings.length === 0) {
    console.log(
      timingsSwitch
        ? 'no timings yet' + (repo === null ? '' : ' for ' + repo) + ': open or refresh a review'
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
  console.log(`${timings.length} timings in ${timingsPath()}${timingsSwitch ? '' : ' (timings are off now)'}\n`);
  const stats = timingStats(timings);
  for (const line of table([
    ['repo', 'step', 'count', 'median', 'max', 'last', 'last detail'],
    ...stats.map((stat) => [
      stat.repo,
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
  const host = hosts.find((line) => line.run === lastRun)?.host;
  const machine = host
    ? `${host.os} ${host.arch}, ${host.cpu} (${host.cores} cores), ${host.memoryGb} GB, bun ${host.bun}, lens ${host.lens}`
    : 'machine not recorded';
  console.log(`\nthe last run (${lastRun}, ${steps[0].repo ?? 'no repository'}), on ${machine}`);
  console.log(`its last ${steps.length} steps in order:\n`);
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
