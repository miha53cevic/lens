/// <reference types="bun" />
// The polling loop (src/ui/poll.ts), on Bun's fake clock: when a watcher runs, and when not.

import { jest, test } from 'bun:test';
import assert from 'node:assert/strict';

// The page, as far as the loop looks at it: whether it is hidden, and its two events.
const page = { visibilityState: 'visible' };
const listeners = new Map<string, () => void>();
const listen = (type: string, listener: () => void) => listeners.set(type, listener);
Object.assign(globalThis, {
  document: {
    get visibilityState() {
      return page.visibilityState;
    },
    addEventListener: listen,
  },
  window: { addEventListener: listen },
});
jest.useFakeTimers();
const { check, watch } = await import('../src/ui/poll.ts');

/** Lets the runs that just started get to their end. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

async function tick(ms: number): Promise<void> {
  jest.advanceTimersByTime(ms);
  await settle();
}

function show(visible: boolean): void {
  page.visibilityState = visible ? 'visible' : 'hidden';
  listeners.get('visibilitychange')!();
}

/** A watcher that counts its runs; `applies` and `hold` are the test's to change. */
function counter(id: string, every: number) {
  const watcher = {
    runs: 0,
    applies: true,
    /** A run waits for this before it ends */
    hold: null as Promise<void> | null,
  };
  watch({
    id,
    every,
    when: () => watcher.applies,
    run: async () => {
      watcher.runs++;
      await watcher.hold;
    },
  });
  return watcher;
}

test('a watcher runs every interval, counted from the end of its last run, and never twice at once', async () => {
  const watcher = counter('steady', 1000);
  await tick(999);
  assert.equal(watcher.runs, 0, 'its first turn is one interval away');
  await tick(1);
  assert.equal(watcher.runs, 1);
  await tick(1000);
  assert.equal(watcher.runs, 2);

  let release = () => {};
  watcher.hold = new Promise((resolve) => (release = resolve));
  await tick(1000);
  assert.equal(watcher.runs, 3);
  await tick(5000);
  assert.equal(watcher.runs, 3, 'a run that is still going is not doubled');
  release();
  watcher.hold = null;
  await settle();
  await tick(999);
  assert.equal(watcher.runs, 3, 'the next turn counts from when the slow run ended');
  await tick(1);
  assert.equal(watcher.runs, 4);
  watcher.applies = false;
});

test('nothing runs while the page is hidden; what is due runs the moment it is visible again', async () => {
  const watcher = counter('hidden', 1000);
  show(false);
  await tick(10_000);
  assert.equal(watcher.runs, 0);
  show(true);
  await settle();
  assert.equal(watcher.runs, 1, 'at once, not an interval later');
  await tick(1000);
  assert.equal(watcher.runs, 2);
  watcher.applies = false;
});

test("the window getting the focus runs everything now; a watcher that doesn't apply is skipped", async () => {
  const watcher = counter('focus', 5000);
  const other = counter('elsewhere', 5000);
  other.applies = false;
  await tick(100);
  listeners.get('focus')!();
  await settle();
  assert.equal(watcher.runs, 1);
  assert.equal(other.runs, 0);
  await tick(10_000);
  assert.equal(other.runs, 0);
  other.applies = true;
  await tick(5000);
  assert.equal(other.runs, 1, 'it is asked again every turn');
  watcher.applies = false;
  other.applies = false;
});

test('check runs a watcher now, and once more when it was asked for during a run', async () => {
  const watcher = counter('checked', 5000);
  watcher.applies = false;
  await check('checked');
  assert.equal(watcher.runs, 1, 'whatever its turn, and whether it applies');

  let release = () => {};
  watcher.hold = new Promise((resolve) => (release = resolve));
  const running = check('checked');
  await settle();
  assert.equal(watcher.runs, 2);
  void check('checked'); // what it would find changed while it ran
  watcher.hold = null;
  release();
  await running;
  assert.equal(watcher.runs, 3);
  await check('nobody');
});
