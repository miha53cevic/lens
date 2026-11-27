// What the app's own pages (the tab strip and the launcher screens) may ask the main process for,
// and what it tells them. The preload script exposes exactly this as `window.lensApp`; the viewer
// gets no preload, so none of it exists there.

import type { AgentInfo, RepoInfo, Worktree } from '../../cli-app/info.ts';
import type { ThemeSwatch } from '../../cli-app/render/highlight.ts';
import type { ReviewChoice } from './choice.ts';

export type { AgentInfo, RepoInfo, ThemeSwatch, Worktree };

export type TabIcon = 'new' | 'folder' | 'setup' | 'sandbox';

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
  /** ⌘ (Ctrl elsewhere) is held on its own: the tabs show the numbers that pick them (main/tabKeys.ts) */
  hints: boolean;
  /** The lens command or the agent skills need installing, or the picked agent can't run (shared/setup.ts): Setup's button carries a dot */
  setupMissing: boolean;
  /** The app's own update: Setup's button carries a dot while one is offered, running or failed */
  update: UpdateState;
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
  /** The branch it was on when last opened here; null when detached or not known */
  branch: string | null;
  /** When it was last opened here, in ms since the epoch; null when not known */
  opened: number | null;
  /** A linked worktree: its repository's main worktree, which Start lists it under. Null: not one, or not known */
  main: string | null;
}

export type SetupPart = 'cli' | 'skills';

export interface SetupItem {
  /**
   * missing: not installed · stale: the app's, pointing at another copy of the app · installed: the
   * app installed it · external: there, but not the app's (left alone)
   */
  state: 'missing' | 'stale' | 'installed' | 'external';
  /** Where it is, or where it would go */
  where: string;
  /** Something to know about it: not on the PATH, which one runs first */
  note: string | null;
}

/**
 * Where the app's own update stands (main/update.ts). It checks only when the reader asks.
 * source: run from a checkout (git pull updates it) · unsupported: a build with no release to take
 * idle: not checked yet · current: the latest release is this one
 * available: a newer release; `canApply` false when the app's folder can't be written to (install.sh instead),
 * `notes` its release notes (markdown, as GitHub has them; shared/release.ts `cleanNotes`), null when it has none
 * applying: downloading and unpacking it, then the app restarts; `progress` 0–1 of the download, null while
 * its size isn't known · failed: the check or the update didn't work
 */
export type UpdateState =
  | { kind: 'source' }
  | { kind: 'unsupported' }
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'current' }
  | { kind: 'available'; version: string; canApply: boolean; folder: string; notes: string | null }
  | { kind: 'applying'; version: string; progress: number | null }
  | { kind: 'failed'; label: string; detail: string };

/** How many commits the picker can list; the first is what `lens info` lists unless asked (COMMITS_SHOWN) */
export const COMMIT_COUNTS = [20, 40, 60] as const;
export type CommitCount = (typeof COMMIT_COUNTS)[number];

export interface LauncherState {
  /** sandbox: the design system's primitives (ui/sandbox), in a tab of its own that Setup opens */
  screen: 'start' | 'picker' | 'setup' | 'sandbox';
  /** The picker over a running review: its back arrow returns to the review */
  canGoBack: boolean;
  recents: Recent[];
  /** The repository the picker is for */
  repo: RepoInfo | null;
  /** How many of its commits the picker lists (`repo.commits` holds at most that many) */
  commitCount: CommitCount;
  /** Its root as shown: the home folder as ~ */
  repoPath: string | null;
  /** Its worktrees' roots as shown, by root */
  worktreePaths: Record<string, string>;
  /** What the review behind the picker shows, to start the picker on it */
  current: ReviewChoice | null;
  /** A lens that already runs for this repository, started somewhere else */
  running: { port: number } | null;
  /** The window's tabs that have a repository: its root → the tab's place in the strip, from 1 */
  openTabs: Record<string, number>;
  /**
   * A tab the app reopened that is still on its way back to its review: the page shows that
   * instead of a screen to pick from. `review` is null while its repository is still being read.
   */
  reopening: { name: string; review: string | null } | null;
  /** A review the picker started that doesn't show yet: the page covers the picker with the review's shape */
  opening: boolean;
  status: LauncherStatus;
  /** git's version, or null when it wasn't found */
  git: string | null;
  version: string;
  /** The agent lens runs itself (the machine's `agent` pick) and whether it can; null when none is picked */
  agent: AgentInfo | null;
  setup: Record<SetupPart, SetupItem>;
  /** The app's own update: whether a newer release is there, and taking it */
  update: UpdateState;
  /** This version's release notes (markdown, from the CHANGELOG the app was built with); null when it has none */
  whatsNew: { version: string; notes: string } | null;
  /** The app was updated and the App page hasn't been opened since: a notice leads there */
  justUpdated: boolean;
  theme: ThemeSwatch;
  /** The UI's size in percent: the viewer's (cli-app/zoom.ts), which the launcher's pages take too */
  zoom: number;
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
  /** The code themes, as a menu under the button whose right and bottom edges are these; again closes it */
  themeMenu(right: number, bottom: number): void;
  setup(): void;
  /** The strip's own colors: what a new tab shows before its page paints, and the window buttons Windows draws */
  chrome(color: string, symbolColor: string): void;
}

export interface LauncherApi {
  state(): Promise<LauncherState>;
  onState(listener: (state: LauncherState) => void): void;
  /** The system's folder dialog */
  openRepository(): void;
  openRecent(root: string): void;
  /** Another of the repository's worktrees, in a tab of its own: this tab stays as it was */
  openWorktree(root: string): void;
  forgetRecent(root: string): void;
  /** Recount "this branch vs" against another base */
  setBase(base: string): void;
  /** List this many commits */
  setCommitCount(count: CommitCount): void;
  /** Read the repository again: the picker asks while it is in sight, so its counts follow a `git add` done elsewhere */
  refresh(): void;
  open(choice: ReviewChoice): void;
  cancel(): void;
  dismiss(): void;
  back(): void;
  /** Show the lens that already runs for this repository in this tab */
  showRunning(): void;
  /** Look for git again */
  recheck(): void;
  setup(): void;
  /** The design system's sandbox, in a tab of its own */
  sandbox(): void;
  install(part: SetupPart): void;
  uninstall(part: SetupPart): void;
  /** Ask GitHub for the latest release */
  checkUpdate(): void;
  /** Take the newer release the check found: download it, quit, swap the app, start it again */
  applyUpdate(): void;
  /** The release notes on GitHub, in the browser: the offered release's, else this version's */
  openReleaseNotes(): void;
}

/** The strip's theme menu: a page of its own, in a view over the whole window while it is open. */
export interface MenuState {
  theme: ThemeSwatch;
  themes: ThemeSwatch[];
  /** Where the menu hangs, in the window: its right edge and its top. Null: closed. */
  at: { right: number; top: number } | null;
}

export interface MenuApi {
  state(): Promise<MenuState>;
  onState(listener: (state: MenuState) => void): void;
  /** One of the themes the menu was given, by name */
  pick(name: string): void;
  /** Esc, or a click outside */
  close(): void;
}

export interface LensAppApi {
  strip: StripApi;
  launcher: LauncherApi;
  menu: MenuApi;
}
