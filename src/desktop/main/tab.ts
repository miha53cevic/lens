// One tab: the start screen, a repository's picker, a running review, or the settings. This is
// the tab's logic, without Electron: what it shows is reported to a TabHost, which the window
// implements with real views and the tests with a fake.

import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import type { LauncherState, LauncherStatus, RepoInfo, StripTab } from '../shared/api.ts';
import { choiceArgs, choiceLabel, choiceProblem, type ReviewChoice } from '../shared/choice.ts';
import { lensInfo, type LensCli } from './cli.ts';
import { tildePath } from './display.ts';
import {
  freePort,
  isPortInUse,
  runningServer,
  startReview,
  type ReviewSession,
  type StartingReview,
} from './session.ts';
import type { Store, StoredTab } from './store.ts';

export interface TabHost {
  /** Something the tab's pages show changed */
  changed(tab: Tab): void;
  /** The review to show in the tab, or null when it has none anymore */
  review(tab: Tab, url: string | null): void;
  /** Another tab already has this repository: go to it. False when none has. */
  goTo(root: string, from: Tab): boolean;
}

/** What a tab's launcher page shows of the tab itself; the window adds what all tabs share. */
export type TabState = Pick<
  LauncherState,
  'screen' | 'canGoBack' | 'repo' | 'current' | 'running' | 'reopening' | 'status'
>;

interface Review {
  /** null: a lens started elsewhere, shown here */
  choice: ReviewChoice | null;
  /** null: not ours to stop */
  session: ReviewSession | null;
  url: string;
}

const IDLE: LauncherStatus = { kind: 'idle' };

/** Whether two answers of the CLI say the same. */
const sameValue = (one: unknown, other: unknown) => JSON.stringify(one) === JSON.stringify(other);

export class Tab {
  readonly id: number;
  screen: LauncherState['screen'];
  repo: RepoInfo | null = null;
  status: LauncherStatus = IDLE;
  running: { port: number } | null = null;
  /** Which of its two pages the tab shows: the launcher, or the review's viewer */
  showing: 'launcher' | 'review' = 'launcher';
  private review_: Review | null = null;
  private starting: StartingReview | null = null;
  /** The repository's reads asked for so far: an answer counts only while it is the newest one's */
  private reads = 0;
  /** How many of them haven't answered yet */
  private reading = 0;
  /** What the picker's last poll failed with: said once, not on every poll */
  private pollFailure: string | null = null;
  /** A reopened tab: the folder it is reading, until `lens info` has answered for it */
  private reopening: string | null = null;
  /** A reopened tab: the review it showed when the app last ran, until one runs here again */
  private restored: ReviewChoice | null = null;
  /** That review starts by itself, the first time the tab is in front */
  private autoStart = false;
  /** That start is under way */
  private resuming = false;
  private readonly cli: LensCli;
  private readonly store: Store;
  private readonly host: TabHost;

  constructor(id: number, screen: 'start' | 'settings', cli: LensCli, store: Store, host: TabHost) {
    this.id = id;
    this.screen = screen;
    this.cli = cli;
    this.store = store;
    this.host = host;
  }

  get reviewUrl(): string | null {
    return this.review_?.url ?? null;
  }

  state(): TabState {
    return {
      screen: this.screen,
      canGoBack: this.screen === 'picker', // to the review when there is one, else to Start
      repo: this.repo,
      current: this.review_?.choice ?? this.restored,
      running: this.review_ ? null : this.running,
      reopening: this.comingBack(),
      status: this.status,
    };
  }

  /**
   * A reopened tab until it is where it was left: while its repository is read, while its review
   * waits for the tab to be in front, and while that review starts. Its page shows a loading
   * screen for all of it, so the picker is only seen when there is something to pick.
   */
  private comingBack(): LauncherState['reopening'] {
    if (this.reopening) return { name: basename(this.reopening), review: null };
    if (!this.repo || !this.restored) return null;
    const starts = this.autoStart && !this.running; // `shown` will start it
    return starts || this.resuming ? { name: this.repo.name, review: choiceLabel(this.restored) } : null;
  }

  strip(): StripTab {
    const { id } = this;
    if (this.screen === 'settings') return { id, icon: 'settings', title: 'Settings', detail: '', canChange: false };
    if (!this.repo) {
      // a reopened tab says whose it is before its repository has been read
      if (this.reopening) {
        return { id, icon: 'folder', title: basename(this.reopening), detail: 'reopening…', canChange: false };
      }
      return { id, icon: 'new', title: 'New tab', detail: '', canChange: false };
    }
    const review = this.review_;
    const detail = review
      ? review.choice
        ? choiceLabel(review.choice)
        : 'from a terminal'
      : this.restored
        ? choiceLabel(this.restored) // as it was left: its review starts when the tab is first in front
        : 'choose a review';
    return {
      id,
      icon: 'folder',
      title: this.repo.name,
      detail,
      canChange: review !== null && this.showing === 'review',
    };
  }

  /** What the app keeps of this tab between runs: its repository and the review it shows. Null: nothing to keep. */
  get stored(): StoredTab | null {
    return this.repo ? { root: this.repo.root, choice: this.review_?.choice ?? this.restored } : null;
  }

  /**
   * Reopens a tab the app had when it last ran, on its picker with the review it showed picked.
   * That review starts when the tab is first in front (`shown`), not here: only a tab you look at
   * costs a process. Nothing stored is trusted: the repository is read again, the review checked
   * as one a page sends. False when the repository isn't there anymore: it gets no tab.
   */
  async restore(root: string, choice: ReviewChoice | null): Promise<boolean> {
    if (this.screen !== 'start' || this.repo) return false;
    this.reopening = root;
    this.set({ kind: 'working', label: `Reading ${basename(root)}…`, cancellable: false });
    let repo: RepoInfo | null = null;
    try {
      // a folder that is gone can't be asked about: the CLI would have nowhere to run
      if (existsSync(root)) repo = (await lensInfo(this.cli, root)).repo;
    } catch {
      /* git can't read it: as good as gone */
    }
    this.reopening = null;
    this.status = IDLE;
    if (!repo) return false;
    this.repo = repo;
    this.screen = 'picker';
    this.running = runningServer(repo.root);
    this.restored = choice && choiceProblem(choice) === null ? choice : null;
    this.autoStart = this.restored !== null;
    this.host.changed(this);
    return true;
  }

  /** The tab came to the front: a reopened tab starts the review it had, the first time. */
  shown(): void {
    if (!this.autoStart || !this.restored) return;
    this.autoStart = false;
    // a lens already runs for the repository, started elsewhere: the picker offers that one instead
    if (this.running || this.status.kind === 'working') return;
    this.resuming = true;
    void this.open(this.restored);
  }

  /** Says what the tab is doing, or what came of it. */
  set(status: LauncherStatus): void {
    this.status = status;
    this.host.changed(this);
  }

  /** Opens the picker for the repository `folder` is in. */
  async openFolder(folder: string): Promise<void> {
    if (this.screen !== 'start' || this.status.kind === 'working') return;
    this.set({ kind: 'working', label: `Reading ${basename(folder)}…`, cancellable: false });
    let info;
    try {
      info = await lensInfo(this.cli, folder);
    } catch (error) {
      return this.set({
        kind: 'failed',
        label: `Couldn't open ${tildePath(folder)}`,
        detail: (error as Error).message,
      });
    }
    if (info.git === null) {
      return this.set({ kind: 'failed', label: "git wasn't found", detail: 'lens reads changes and PRs through git' });
    }
    if (!info.repo) {
      return this.set({
        kind: 'failed',
        label: `Couldn't open ${tildePath(folder)}`,
        detail: 'not inside a git repository',
      });
    }
    this.status = IDLE;
    if (this.host.goTo(info.repo.root, this)) return this.host.changed(this);
    this.repo = info.repo;
    this.screen = 'picker';
    this.running = runningServer(info.repo.root);
    this.store.touch(info.repo.root);
    this.host.changed(this);
  }

  /** Reads the repository again: the counts, the branch, and "this branch vs" against `base`. */
  refresh(base?: string): Promise<void> {
    return this.read(base, false);
  }

  /**
   * The picker asks every few seconds while it is in sight, so its counts follow what happens to
   * the repository elsewhere. Quiet: nothing is reported when nothing changed, and a failure once.
   */
  async poll(): Promise<void> {
    // a read that is under way answers soon enough
    if (this.screen !== 'picker' || this.status.kind === 'working' || this.reading > 0) return;
    await this.read(undefined, true);
  }

  private async read(base: string | undefined, quiet: boolean): Promise<void> {
    const root = this.repo?.root;
    if (!root) return;
    const read = ++this.reads;
    // the tab moved on while git answered, or a newer read was asked for (another base)
    const outdated = () => read !== this.reads || this.repo?.root !== root;
    this.reading++;
    try {
      const info = await lensInfo(this.cli, root, { base: base ?? this.repo?.base ?? undefined });
      if (outdated()) return;
      if (!info.repo) return this.repositoryGone(root, 'not inside a git repository anymore');
      this.pollFailure = null;
      const running = this.review_ ? this.running : runningServer(root);
      if (quiet && sameValue(info.repo, this.repo) && sameValue(running, this.running)) return;
      this.repo = info.repo;
      this.running = running;
      this.host.changed(this);
    } catch (error) {
      if (outdated()) return;
      if (!existsSync(root)) return this.repositoryGone(root, 'the folder was deleted or moved');
      const detail = (error as Error).message;
      if (quiet && detail === this.pollFailure) return;
      this.pollFailure = detail;
      this.set({ kind: 'failed', label: "Couldn't read the repository", detail });
    } finally {
      this.reading--;
    }
  }

  /** The picker's repository isn't there anymore: back to Start, saying so. A review that still runs keeps its tab. */
  private repositoryGone(root: string, detail: string): void {
    const status: LauncherStatus = { kind: 'failed', label: `${tildePath(root)} is gone`, detail };
    if (this.review_) {
      if (this.pollFailure !== detail) this.set(status);
      this.pollFailure = detail;
      return;
    }
    this.screen = 'start';
    this.repo = null;
    this.running = null;
    this.restored = null;
    this.set(status);
  }

  /** Starts the review the picker chose, in place of the one the tab has. */
  async open(choice: ReviewChoice): Promise<void> {
    const root = this.repo?.root;
    if (!root || this.status.kind === 'working') return;
    const problem = choiceProblem(choice);
    if (problem) return this.set({ kind: 'failed', label: "Couldn't open the review", detail: problem });

    const label = choiceLabel(choice);
    this.autoStart = false;
    this.set({
      kind: 'working',
      label: choice.kind === 'pr' ? `Fetching ${label}…` : `Opening ${label}…`,
      cancellable: true,
    });
    // one viewer per repository: the one this tab shows goes first (it holds the repository's port)
    await this.endReview();
    try {
      const session = await this.start(root, choiceArgs(choice));
      this.review_ = { choice, session, url: session.url };
      this.restored = null;
      this.resuming = false;
      this.showing = 'review';
      this.status = IDLE;
      this.host.review(this, session.url);
      this.host.changed(this);
      void session.exited.then(() => this.reviewExited(session));
    } catch (error) {
      const message = (error as Error).message;
      // a reopened review that didn't start: the picker, with the reason
      this.resuming = false;
      this.set(message === 'cancelled' ? IDLE : { kind: 'failed', label: "Couldn't open the review", detail: message });
    } finally {
      this.starting = null;
    }
  }

  /** The repository's own port, so its viewer keeps its localStorage; another when that one is taken. */
  private async start(root: string, args: string[]): Promise<ReviewSession> {
    const kept = this.store.port(root);
    let port = kept ?? (await freePort());
    for (let attempt = 0; ; attempt++) {
      this.starting = startReview(this.cli, root, args, port);
      try {
        const session = await this.starting.ready;
        if (port !== kept) this.store.setPort(root, port);
        return session;
      } catch (error) {
        if (attempt > 0 || !isPortInUse(error)) throw error;
        port = await freePort();
      }
    }
  }

  /** The viewer's End session, or the CLI going away: back to the picker. */
  private reviewExited(session: ReviewSession): void {
    if (this.review_?.session !== session) return;
    this.review_ = null;
    this.showing = 'launcher';
    this.host.review(this, null);
    this.host.changed(this);
    void this.refresh();
  }

  private async endReview(): Promise<void> {
    const review = this.review_;
    if (!review) return;
    this.review_ = null;
    this.showing = 'launcher';
    this.host.review(this, null);
    await review.session?.stop();
  }

  cancel(): void {
    this.starting?.cancel();
  }

  dismiss(): void {
    if (this.status.kind === 'failed' || this.status.kind === 'done') this.set(IDLE);
  }

  /** ▾ on the tab: the picker, over the review. */
  change(): void {
    if (!this.review_ || this.showing === 'launcher') return;
    this.showing = 'launcher';
    this.host.changed(this);
    void this.refresh();
  }

  /** The picker's back arrow: to the review it is over, else to Start. */
  back(): void {
    if (this.screen !== 'picker' || this.status.kind === 'working') return;
    if (this.review_) this.showing = 'review';
    else {
      this.screen = 'start';
      this.repo = null;
      this.running = null;
      this.restored = null;
    }
    this.set(IDLE);
  }

  /** Shows the lens that already runs for this repository, instead of starting a second. */
  showRunning(): void {
    const running = this.repo && !this.review_ ? runningServer(this.repo.root) : null;
    if (!running) return void this.refresh();
    this.review_ = { choice: null, session: null, url: `http://127.0.0.1:${running.port}/` };
    this.showing = 'review';
    this.status = IDLE;
    this.host.review(this, this.review_.url);
    this.host.changed(this);
  }

  /** The tab is closing: nothing of it keeps running. */
  async close(): Promise<void> {
    this.starting?.cancel();
    await this.endReview();
  }
}
