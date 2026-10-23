// What the app remembers between runs: the folders you opened, the port each repository's viewer
// gets, where the window was, and the tabs that were open with the review each showed.
// The last two describe a moment that has passed, so nothing here is trusted when it is read back:
// a window is placed where a display still is (bounds.ts), and a tab is reopened only once
// `lens info` has found its repository again and its review has been checked like a page's.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseChoice, type ReviewChoice } from '../shared/choice.ts';

/** The window's place when it isn't maximized, and whether it was. */
export interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
}

export interface StoredTab {
  /** The repository's root */
  root: string;
  /** The review it showed; null: it was on its picker, or showed a lens started elsewhere */
  choice: ReviewChoice | null;
}

/** The tabs that had a repository, in order. Start, Settings and sandbox tabs aren't kept. */
export interface Session {
  tabs: StoredTab[];
  /** Which of `tabs` was in front; -1: a tab that isn't kept was */
  active: number;
}

interface Stored {
  /** Repository roots, most recent first */
  recents: string[];
  /**
   * The viewer's port per repository. It stays the same between runs: the viewer keeps its
   * view settings in localStorage, which the browser files under the page's port.
   */
  ports: Record<string, number>;
  window: WindowState | null;
  session: Session | null;
}

const MAX_RECENTS = 12;
/** More tabs than anyone left open: a file that says so isn't one the app wrote */
const MAX_TABS = 50;

function readWindow(raw: unknown): WindowState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { x, y, width, height, maximized } = raw as Record<string, unknown>;
  const numbers = [x, y, width, height];
  if (!numbers.every((value) => typeof value === 'number' && Number.isFinite(value))) return null;
  return {
    x: x as number,
    y: y as number,
    width: width as number,
    height: height as number,
    maximized: maximized === true,
  };
}

function readSession(raw: unknown): Session | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { tabs, active } = raw as Record<string, unknown>;
  if (!Array.isArray(tabs)) return null;
  const kept: StoredTab[] = [];
  for (const tab of tabs.slice(0, MAX_TABS)) {
    if (typeof tab?.root !== 'string' || tab.root === '') continue;
    // a choice that doesn't parse (a hand-edited file, another version's) leaves the tab on its picker
    kept.push({ root: tab.root, choice: parseChoice(tab.choice) });
  }
  const front = Number.isInteger(active) && (active as number) >= 0 && (active as number) < kept.length;
  return { tabs: kept, active: front ? (active as number) : -1 };
}

function read(file: string): Stored {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    const recents = Array.isArray(raw?.recents) ? raw.recents.filter((root: unknown) => typeof root === 'string') : [];
    const ports: Record<string, number> = {};
    for (const [root, port] of Object.entries(raw?.ports ?? {})) {
      if (Number.isInteger(port)) ports[root] = port as number;
    }
    return { recents, ports, window: readWindow(raw?.window), session: readSession(raw?.session) };
  } catch {
    return { recents: [], ports: {}, window: null, session: null }; // no file yet, or not one the app wrote
  }
}

export interface Store {
  /** The recent repositories that still exist, most recent first. */
  recents(): string[];
  /** Puts a repository first in the recents. */
  touch(root: string): void;
  forget(root: string): void;
  port(root: string): number | null;
  setPort(root: string, port: number): void;
  /** Where the window was when the app last ran, or null the first time. */
  window(): WindowState | null;
  setWindow(state: WindowState): void;
  /** The tabs the app had when it last ran, or null the first time. */
  session(): Session | null;
  setSession(session: Session): void;
}

const same = (one: unknown, other: unknown) => JSON.stringify(one) === JSON.stringify(other);

export function openStore(file: string): Store {
  let stored = read(file);
  const save = () => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(stored, null, 2) + '\n');
  };
  return {
    recents() {
      const existing = stored.recents.filter((root) => existsSync(root));
      if (existing.length !== stored.recents.length) {
        // a folder that is gone is dropped for good, its port with it
        const ports = Object.fromEntries(Object.entries(stored.ports).filter(([root]) => existing.includes(root)));
        stored = { ...stored, recents: existing, ports };
        save();
      }
      return existing;
    },
    touch(root) {
      stored = {
        ...stored,
        recents: [root, ...stored.recents.filter((other) => other !== root)].slice(0, MAX_RECENTS),
      };
      save();
    },
    forget(root) {
      const { [root]: _port, ...ports } = stored.ports;
      stored = { ...stored, recents: stored.recents.filter((other) => other !== root), ports };
      save();
    },
    port: (root) => stored.ports[root] ?? null,
    setPort(root, port) {
      stored = { ...stored, ports: { ...stored.ports, [root]: port } };
      save();
    },
    window: () => stored.window,
    setWindow(state) {
      // asked for on every move: written only when it says something new
      if (same(state, stored.window)) return;
      stored = { ...stored, window: state };
      save();
    },
    session: () => stored.session,
    setSession(session) {
      if (same(session, stored.session)) return;
      stored = { ...stored, session };
      save();
    },
  };
}
