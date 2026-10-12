// Everything a page watches by asking again and again goes through this one loop, so its rules
// are in one place: nothing runs while the page is hidden, what is due runs the moment the page
// is visible again or its window gets the focus, and a watcher never runs twice at once.
// A feature registers a watcher and keeps no timer of its own. The app's pages use it too.

export interface Watcher {
  /** What `check` asks for it by: 'ask', 'stamp' … */
  id: string;
  /** Milliseconds from the end of one run to the start of the next */
  every: number;
  /** Whether it applies now (the rail is open, the picker is on screen): asked before every turn */
  when: () => boolean;
  run: () => unknown;
}

interface Watched extends Watcher {
  /** When its next turn is */
  due: number;
  running: boolean;
  /** `check` was asked for while it ran: it runs once more, for what changed meanwhile */
  again: boolean;
}

// The loop's registry and its one timer: resources, not state (nothing renders from them).
const watched = new Map<string, Watched>();
let timer: ReturnType<typeof setTimeout> | null = null;
let listening = false;

const isHidden = () => document.visibilityState === 'hidden';

async function runWatcher(watcher: Watched): Promise<void> {
  if (watcher.running) {
    watcher.again = true;
    return;
  }
  watcher.running = true;
  try {
    do {
      watcher.again = false;
      try {
        await watcher.run();
      } catch {
        /* a watcher reports its own failures: the loop goes on */
      }
    } while (watcher.again);
  } finally {
    watcher.running = false;
    watcher.due = Date.now() + watcher.every;
    schedule();
  }
}

/** Runs every watcher whose turn it is. */
function turn(): void {
  const now = Date.now();
  for (const watcher of watched.values()) {
    if (watcher.running || watcher.due > now) continue;
    if (watcher.when()) void runWatcher(watcher);
    else watcher.due = now + watcher.every;
  }
  schedule();
}

/** One timer, for the soonest turn; none while the page is hidden. */
function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (isHidden()) return;
  let soonest = Infinity;
  for (const watcher of watched.values()) if (!watcher.running) soonest = Math.min(soonest, watcher.due);
  if (soonest !== Infinity) timer = setTimeout(turn, Math.max(0, soonest - Date.now()));
}

/** The page is in sight again, or its window has the focus: everything is due now. */
function wake(): void {
  if (isHidden()) return schedule();
  const now = Date.now();
  for (const watcher of watched.values()) watcher.due = now;
  turn();
}

/** Registers a watcher: its first turn is one interval from now. */
export function watch(watcher: Watcher): void {
  if (!listening) {
    listening = true;
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
  }
  watched.set(watcher.id, { ...watcher, due: Date.now() + watcher.every, running: false, again: false });
  schedule();
}

/** Runs a watcher now, whatever its turn and whether it applies: after an action that changes what it would find. */
export function check(id: string): Promise<void> {
  const watcher = watched.get(id);
  return watcher ? runWatcher(watcher) : Promise.resolve();
}
