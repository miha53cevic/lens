import { existsSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { highlightSides, type OldSide, type SidesResult } from './highlight.ts';
import { timed } from '../timings.ts';

/**
 * Shiki tokenizes on one thread, and a big diff is seconds of it: the files are spread over a few
 * worker threads instead (highlightWorker.ts). Each file is tokenized whole, by the same code, so
 * the tokens are the same as one thread's; nothing is kept between calls but the threads.
 */

/** A file to tokenize: its new side, and its old side when it has removed lines (highlightSides) */
export interface HighlightJob {
  source: string;
  language: string | null;
  theme: string;
  old: OldSide | null;
}

/**
 * One call's files, sent to every thread. `next` is a shared counter: each thread takes the next
 * file from it as it finishes one, so the threads share the work without asking this thread, which
 * may be busy (parsing the same files) while they tokenize.
 */
export type HighlightBatch = { batch: number; jobs: HighlightJob[]; next: SharedArrayBuffer };
export type HighlightReply =
  { batch: number; index: number; result: SidesResult } | { batch: number; index: number; error: string };

interface Batch {
  jobs: HighlightJob[];
  results: (SidesResult | undefined)[];
  left: number;
  resolve: (results: SidesResult[]) => void;
  reject: (err: Error) => void;
}

/** Less text than this is tokenized on this thread: a worker's start (Shiki, its grammars) costs more. */
const POOL_MIN_CHARS = 200_000;
/** More threads cost more memory (each holds Shiki) than they save: four was the fastest per MB on a 109-file diff. */
const MAX_WORKERS = 4;
/** Threads left idle this long are stopped: a viewer runs for hours, and they hold ~50 MB each. */
const IDLE_MS = 60_000;

let pool: Worker[] | null = null;
/** Set once a worker failed to start or crashed: from then on, everything is tokenized here. */
let broken = false;
const batches = new Map<number, Batch>();
let nextBatch = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Starts the threads ahead of the first call, so they warm up (highlightWorker.ts) while the
 * caller does other work, such as the analysis the tokens are for.
 */
export function warmHighlighter(): void {
  if (broken || pool) return;
  try {
    pool = startPool();
    settle();
  } catch {
    broken = true;
  }
}

/** Tokenizes each file, in order; across worker threads when there is enough to share. */
export function highlightAll(jobs: HighlightJob[]): Promise<SidesResult[]> {
  const chars = jobs.reduce((sum, job) => sum + size(job), 0);
  const here = broken || chars < POOL_MIN_CHARS;
  return timed(
    'server',
    'highlight',
    () => (here ? inProcess(jobs) : onThreads(jobs)),
    () => `${jobs.length} files, ${chars} chars, ${here ? 'in process' : (pool?.length ?? 0) + ' threads'}`,
  );
}

const size = (job: HighlightJob) => job.source.length + (job.old?.text.length ?? 0);

function onThreads(jobs: HighlightJob[]): Promise<SidesResult[]> {
  let workers: Worker[];
  try {
    workers = pool ??= startPool();
  } catch {
    broken = true;
    return inProcess(jobs);
  }
  // the biggest first, so no thread is left with a big file at the end
  const order = jobs.map((_, index) => index).sort((a, b) => size(jobs[b]) - size(jobs[a]));
  const sorted = order.map((index) => jobs[index]);
  const batch = nextBatch++;
  const done = new Promise<SidesResult[]>((resolve, reject) =>
    batches.set(batch, { jobs: sorted, results: new Array(sorted.length), left: sorted.length, resolve, reject }),
  );
  if (sorted.length === 0) finish(batch);
  const next = new SharedArrayBuffer(4);
  for (const worker of workers) worker.postMessage({ batch, jobs: sorted, next } satisfies HighlightBatch);
  settle();
  return done.then((results) => {
    const inOrder: SidesResult[] = new Array(jobs.length);
    order.forEach((index, at) => (inOrder[index] = results[at]));
    return inOrder;
  });
}

function inProcess(jobs: HighlightJob[]): Promise<SidesResult[]> {
  return Promise.all(jobs.map(runHere));
}

function runHere({ source, language, theme, old }: HighlightJob): Promise<SidesResult> {
  return highlightSides(source, language, theme, old);
}

/**
 * The worker's file: beside this module from source. In the compiled lens every module's
 * import.meta.url is the binary's own, at the root of its files, and the worker (an entrypoint
 * beside cli.ts, scripts/compile.ts) sits under render/ there.
 */
function workerUrl(): URL {
  const beside = new URL('./highlightWorker.ts', import.meta.url);
  return existsSync(fileURLToPath(beside)) ? beside : new URL('./render/highlightWorker.ts', import.meta.url);
}

function startPool(): Worker[] {
  const size = Math.max(1, Math.min(MAX_WORKERS, availableParallelism() - 1));
  return Array.from({ length: size }, () => {
    const worker = new Worker(workerUrl());
    worker.on('message', (text: string) => {
      const reply = JSON.parse(text) as HighlightReply;
      const batch = batches.get(reply.batch);
      if (!batch) return;
      if ('error' in reply) {
        batches.delete(reply.batch);
        batch.reject(new Error(reply.error));
      } else {
        batch.results[reply.index] = reply.result;
        if (--batch.left === 0) finish(reply.batch);
      }
      settle();
    });
    // a thread that can't run (a compiled lens without it, a crash): what the pool holds is
    // tokenized here instead, and the pool isn't used again
    worker.on('error', giveUp);
    return worker;
  });
}

function finish(id: number): void {
  const batch = batches.get(id)!;
  batches.delete(id);
  batch.resolve(batch.results as SidesResult[]);
}

/** Threads keep the process alive while there is work; once there is none, they stop after a while. */
function settle(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  // an idle thread doesn't keep the process alive: `lens diff --json`, a test, exit as before
  for (const worker of pool ?? []) {
    if (batches.size > 0) worker.ref();
    else worker.unref();
  }
  if (!pool || batches.size > 0) return;
  idleTimer = setTimeout(() => {
    for (const worker of pool ?? []) worker.terminate();
    pool = null;
  }, IDLE_MS);
  idleTimer.unref();
}

function giveUp(): void {
  broken = true;
  if (idleTimer) clearTimeout(idleTimer);
  for (const worker of pool ?? []) worker.terminate();
  pool = null;
  for (const [id, batch] of batches) {
    batch.jobs.forEach((job, index) => {
      if (batch.results[index]) return;
      runHere(job).then((result) => {
        batch.results[index] = result;
        if (--batch.left === 0) finish(id);
      }, batch.reject);
    });
  }
}
