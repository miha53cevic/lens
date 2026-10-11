// What the app's own pages (the tab strip and the launcher screens) may ask the main process for,
// and what it tells them. The preload script exposes exactly this as `window.lensApp`; the viewer
// gets no preload, so none of it exists there.

import type { RepoInfo } from '../../cli-app/info.ts';
import type { ThemeSwatch } from '../../cli-app/render/highlight.ts';
import type { ReviewChoice } from './choice.ts';

export type { RepoInfo, ThemeSwatch };

export type TabIcon = 'new' | 'folder' | 'settings';

export interface StripTab {
  id: number;
  icon: TabIcon;
  /** The repository's name, or what the tab is */
  title: string;
  /** What it shows of the repository: "staged changes", "PR #482", "choose a review" */
  detail: string;
  /** A review is behind it: its ▾ opens the picker to change what's reviewed */
  canChange: boolean;
}

export interface StripState {
  tabs: StripTab[];
  activeId: number;
  theme: ThemeSwatch;
  platform: string;
  /** macOS full screen: the window buttons are gone, the strip can use their room */
  fullscreen: boolean;
}

/** One status, as the viewer's status bar has one: what the tab is doing, or what went wrong. */
export type LauncherStatus =
  | { kind: 'idle' }
  | { kind: 'working'; label: string; cancellable: boolean }
  | { kind: 'failed'; label: string; detail: string }
  | { kind: 'done'; label: string };

export interface Recent {
  root: string;
  name: string;
  /** The root as shown: the home folder as ~ */
  path: string;
}

export type SetupPart = 'cli' | 'skills';

export interface SetupItem {
  /** missing: not installed · installed: the app installed it · external: there, but not the app's (left alone) */
  state: 'missing' | 'installed' | 'external';
  /** Where it is, or where it would go */
  where: string;
  /** Something to know about it: not on the PATH, which one runs first */
  note: string | null;
}

export interface LauncherState {
  screen: 'start' | 'picker' | 'settings';
  /** The picker over a running review: its back arrow returns to the review */
  canGoBack: boolean;
  recents: Recent[];
  /** The repository the picker is for */
  repo: RepoInfo | null;
  /** Its root as shown: the home folder as ~ */
  repoPath: string | null;
  /** What the review behind the picker shows, to start the picker on it */
  current: ReviewChoice | null;
  /** A lens that already runs for this repository, started somewhere else */
  running: { port: number } | null;
  status: LauncherStatus;
  /** git's version, or null when it wasn't found */
  git: string | null;
  version: string;
  setup: Record<SetupPart, SetupItem>;
  theme: ThemeSwatch;
  platform: string;
}

export interface StripApi {
  state(): Promise<StripState>;
  onState(listener: (state: StripState) => void): void;
  select(id: number): void;
  close(id: number): void;
  add(): void;
  /** ▾ on a review's tab */
  change(id: number): void;
  /** The code themes, as the system's menu under the button at (x, y) */
  themeMenu(x: number, y: number): void;
  settings(): void;
  /** The strip's own colors: what a new tab shows before its page paints, and the window buttons Windows draws */
  chrome(color: string, symbolColor: string): void;
}

export interface LauncherApi {
  state(): Promise<LauncherState>;
  onState(listener: (state: LauncherState) => void): void;
  /** The system's folder dialog */
  openRepository(): void;
  openRecent(root: string): void;
  forgetRecent(root: string): void;
  /** Recount "this branch vs" against another base */
  setBase(base: string): void;
  open(choice: ReviewChoice): void;
  cancel(): void;
  dismiss(): void;
  back(): void;
  /** Show the lens that already runs for this repository in this tab */
  showRunning(): void;
  /** Look for git again */
  recheck(): void;
  settings(): void;
  install(part: SetupPart): void;
  uninstall(part: SetupPart): void;
}

export interface LensAppApi {
  strip: StripApi;
  launcher: LauncherApi;
}

/** The calls a page may make: the preload forwards these names and nothing else. */
export const STRIP_CALLS = ['select', 'close', 'add', 'change', 'themeMenu', 'settings', 'chrome'] as const;
export const LAUNCHER_CALLS = [
  'openRepository',
  'openRecent',
  'forgetRecent',
  'setBase',
  'open',
  'cancel',
  'dismiss',
  'back',
  'showRunning',
  'recheck',
  'settings',
  'install',
  'uninstall',
] as const;

export type StripCall = (typeof STRIP_CALLS)[number];
export type LauncherCall = (typeof LAUNCHER_CALLS)[number];
