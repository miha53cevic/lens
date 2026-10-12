// The window: the tab strip (the window's own page) with one embedded view per tab under it.
// A tab has a launcher view, the app's own page, and while a review runs, a viewer view on the
// address the CLI serves. Tab logic is in tab.ts; this file gives it real views.

import { homedir } from 'node:os';
import { basename } from 'node:path';
import {
  BrowserWindow,
  Menu,
  WebContentsView,
  dialog,
  ipcMain,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from 'electron';
import {
  LAUNCHER_CALLS,
  STRIP_CALLS,
  type LauncherCall,
  type LauncherState,
  type SetupPart,
  type StripCall,
  type StripState,
} from '../shared/api.ts';
import { parseChoice } from '../shared/choice.ts';
import type { LensCli } from './cli.ts';
import { tildePath } from './display.ts';
import { APP_ORIGIN, allowOrigin, appPagePreferences, isAppPage, viewerPreferences } from './security.ts';
import { install, setupState, uninstall, type SetupEnv } from './setup.ts';
import type { Store } from './store.ts';
import { Tab, type TabHost } from './tab.ts';
import { TabList } from './tabs.ts';
import type { Themes } from './themes.ts';

/** The strip's height: the views start under it. The shell's stylesheet has the same number. */
export const STRIP_HEIGHT = 40;

interface TabViews {
  launcher: WebContentsView;
  review: WebContentsView | null;
}

export interface WindowDeps {
  cli: LensCli;
  store: Store;
  themes: Themes;
  preload: string;
  setup: SetupEnv;
}

export class AppWindow implements TabHost {
  readonly win: BrowserWindow;
  readonly tabs = new TabList();
  private readonly views = new Map<number, TabViews>();
  private readonly deps: WindowDeps;
  private closing = false;
  /** The pages' own background in the theme of the moment, as the strip's page measured it */
  private pageBackground: string | null = null;

  constructor(deps: WindowDeps) {
    this.deps = deps;
    const { bg, fg } = deps.themes.current;
    this.win = new BrowserWindow({
      width: 1320,
      height: 880,
      minWidth: 760,
      minHeight: 480,
      show: false,
      backgroundColor: bg,
      // no system title bar: the OS draws only its buttons, over the strip
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: bg, symbolColor: fg, height: STRIP_HEIGHT },
      trafficLightPosition: { x: 14, y: 13 },
      webPreferences: appPagePreferences(deps.preload),
    });
    allowOrigin(this.win.webContents, APP_ORIGIN);
    void this.win.loadURL(APP_ORIGIN + '/shell.html');
    this.win.once('ready-to-show', () => this.win.show());
    this.win.on('resize', () => this.layout());
    this.win.on('enter-full-screen', () => this.sendStrip());
    this.win.on('leave-full-screen', () => this.sendStrip());
    // nothing of a review outlives the window: its tabs stop their CLI processes first
    this.win.on('close', (event) => {
      if (this.closing) return;
      event.preventDefault();
      this.closing = true;
      void Promise.allSettled(this.tabs.all.map((tab) => tab.close())).then(() => this.win.destroy());
    });
    this.listen();
    this.addTab('start');
  }

  // ---- tabs ----

  addTab(screen: 'start' | 'settings'): Tab {
    const tab = new Tab(this.tabs.newId(), screen, this.deps.cli, this.deps.store, this);
    const launcher = new WebContentsView({ webPreferences: appPagePreferences(this.deps.preload) });
    launcher.setBackgroundColor(this.background());
    allowOrigin(launcher.webContents, APP_ORIGIN);
    void launcher.webContents.loadURL(APP_ORIGIN + '/launcher.html');
    this.win.contentView.addChildView(launcher);
    this.views.set(tab.id, { launcher, review: null });
    this.tabs.add(tab);
    this.show();
    return tab;
  }

  selectTab(id: number): void {
    if (this.tabs.select(id)) this.show();
  }

  async closeTab(id: number): Promise<void> {
    const tab = this.tabs.remove(id);
    if (!tab) return;
    const views = this.views.get(id);
    this.views.delete(id);
    for (const view of [views?.launcher, views?.review]) if (view) this.dropView(view);
    // a window always has a tab: the last one closed leaves Start
    if (this.tabs.all.length === 0) this.addTab('start');
    else this.show();
    await tab.close();
  }

  openSettings(): void {
    const settings = this.tabs.settings();
    if (settings) this.selectTab(settings.id);
    else this.addTab('settings');
  }

  /**
   * What a view shows until its page has painted: the pages' background, so a new tab doesn't flash.
   * That is mixed from the theme in CSS (--bg), so the strip's page reports it; until it has, the
   * theme's own background is the nearest color there is.
   */
  private background(): string {
    return this.pageBackground ?? this.deps.themes.current.bg;
  }

  private paintBackgrounds(): void {
    const color = this.background();
    this.win.setBackgroundColor(color);
    for (const views of this.views.values()) {
      views.launcher.setBackgroundColor(color);
      views.review?.setBackgroundColor(color);
    }
  }

  private dropView(view: WebContentsView): void {
    this.win.contentView.removeChildView(view);
    view.webContents.close();
  }

  /** The active tab's page in view, under the strip; every other view hidden. */
  private layout(): void {
    const [width, height] = this.win.getContentSize();
    const bounds = { x: 0, y: STRIP_HEIGHT, width, height: Math.max(0, height - STRIP_HEIGHT) };
    for (const tab of this.tabs.all) {
      const views = this.views.get(tab.id);
      if (!views) continue;
      const front =
        tab === this.tabs.active ? (tab.showing === 'review' && views.review ? views.review : views.launcher) : null;
      for (const view of [views.launcher, views.review]) {
        if (!view) continue;
        view.setVisible(view === front);
        if (view === front) view.setBounds(bounds);
      }
      if (front && !front.webContents.isFocused() && this.win.isFocused()) front.webContents.focus();
    }
  }

  /** After anything a tab shows changed: its page, the strip, which view is in front. */
  private show(): void {
    const active = this.tabs.active;
    if (active) this.sendLauncher(active);
    this.sendStrip();
    this.layout();
  }

  // ---- TabHost: what a tab asks of the window ----

  changed(tab: Tab): void {
    this.sendLauncher(tab);
    this.sendStrip();
    this.layout();
  }

  review(tab: Tab, url: string | null): void {
    const views = this.views.get(tab.id);
    if (!views) return;
    if (views.review) this.dropView(views.review);
    views.review = null;
    if (url) {
      const view = new WebContentsView({ webPreferences: viewerPreferences() });
      view.setBackgroundColor(this.background());
      allowOrigin(view.webContents, new URL(url).origin);
      void view.webContents.loadURL(url);
      this.win.contentView.addChildView(view);
      views.review = view;
    }
    this.layout();
  }

  goTo(root: string, from: Tab): boolean {
    const other = this.tabs.withRepo(root, from);
    if (other) this.selectTab(other.id);
    return other !== null;
  }

  // ---- what the pages are told ----

  private stripState(): StripState {
    return {
      ...this.tabs.strip(),
      theme: this.deps.themes.current,
      platform: process.platform,
      fullscreen: this.win.isFullScreen(),
    };
  }

  private launcherState(tab: Tab): LauncherState {
    const { themes, store, setup } = this.deps;
    return {
      ...tab.state(),
      repoPath: tab.repo ? tildePath(tab.repo.root, homedir()) : null,
      recents: store.recents().map((root) => ({ root, name: basename(root), path: tildePath(root, homedir()) })),
      git: themes.git,
      version: themes.version,
      setup: setupState(setup),
      theme: themes.current,
      platform: process.platform,
    };
  }

  private sendStrip(): void {
    if (!this.win.isDestroyed()) this.win.webContents.send('strip:changed', this.stripState());
  }

  private sendLauncher(tab: Tab): void {
    const view = this.views.get(tab.id)?.launcher;
    if (view && !view.webContents.isDestroyed()) view.webContents.send('launcher:changed', this.launcherState(tab));
  }

  /** The theme changed: the window's own colors, every page of the app, and the open reviews. */
  themeChanged(): void {
    const { name } = this.deps.themes.current;
    // the strip's page reports the new theme's background once it has taken it
    this.pageBackground = null;
    this.paintBackgrounds();
    for (const tab of this.tabs.all) {
      const views = this.views.get(tab.id);
      this.sendLauncher(tab);
      // a review switches through its own theme menu: its item for this theme, by the id the viewer gives it
      const pick = `document.getElementById(${JSON.stringify('theme-' + name)})?.click()`;
      void views?.review?.webContents.executeJavaScript(pick, true).catch(() => {});
    }
    this.sendStrip();
  }

  // ---- what the pages ask: every call checked for who makes it and what it carries ----

  private tabOf(event: IpcMainEvent | IpcMainInvokeEvent): Tab | null {
    if (!isAppPage(event.sender, event.senderFrame?.url)) return null;
    for (const [id, views] of this.views) {
      if (views.launcher.webContents === event.sender) return this.tabs.get(id);
    }
    return null;
  }

  private isStrip(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
    return event.sender === this.win.webContents && isAppPage(event.sender, event.senderFrame?.url);
  }

  private listen(): void {
    ipcMain.handle('strip:state', (event) => (this.isStrip(event) ? this.stripState() : null));
    ipcMain.handle('launcher:state', (event) => {
      const tab = this.tabOf(event);
      return tab ? this.launcherState(tab) : null;
    });
    for (const call of STRIP_CALLS) {
      ipcMain.on('strip:' + call, (event, ...args: unknown[]) => {
        if (this.isStrip(event)) this.stripCall(call, args);
      });
    }
    for (const call of LAUNCHER_CALLS) {
      ipcMain.on('launcher:' + call, (event, ...args: unknown[]) => {
        const tab = this.tabOf(event);
        if (tab) void this.launcherCall(tab, call, args);
      });
    }
  }

  private stripCall(call: StripCall, [first, second]: unknown[]): void {
    const id = typeof first === 'number' ? first : -1;
    switch (call) {
      case 'select':
        return this.selectTab(id);
      case 'close':
        return void this.closeTab(id);
      case 'add':
        return void this.addTab('start');
      case 'change':
        this.selectTab(id);
        return this.tabs.get(id)?.change();
      case 'settings':
        return this.openSettings();
      case 'themeMenu':
        if (typeof first === 'number' && typeof second === 'number') this.themeMenu(first, second);
        return;
      case 'chrome':
        if (!isHexColor(first) || !isHexColor(second)) return;
        this.pageBackground = first;
        this.paintBackgrounds();
        // Windows draws its buttons over the strip in these colors; macOS has its own lights
        if (process.platform !== 'darwin') {
          this.win.setTitleBarOverlay({ color: first, symbolColor: second, height: STRIP_HEIGHT });
        }
        return;
    }
  }

  /** The code themes, as the system's menu: a page's own popover would open under the tab's view. */
  private themeMenu(x: number, y: number): void {
    const { themes } = this.deps;
    const menu = Menu.buildFromTemplate(
      themes.all.map((theme) => ({
        label: theme.name,
        type: 'radio' as const,
        checked: theme.name === themes.current.name,
        click: () => void themes.pick(theme.name),
      })),
    );
    menu.popup({ window: this.win, x: Math.round(x), y: Math.round(y) });
  }

  private async launcherCall(tab: Tab, call: LauncherCall, [first]: unknown[]): Promise<void> {
    const { store } = this.deps;
    switch (call) {
      case 'openRepository': {
        const picked = await dialog.showOpenDialog(this.win, {
          title: 'Open repository',
          properties: ['openDirectory'],
        });
        if (!picked.canceled && picked.filePaths[0]) await tab.openFolder(picked.filePaths[0]);
        return;
      }
      case 'openRecent':
        // only a folder the app itself listed: a page can't name an arbitrary one
        if (typeof first === 'string' && store.recents().includes(first)) await tab.openFolder(first);
        return;
      case 'forgetRecent':
        if (typeof first === 'string') store.forget(first);
        return this.sendLauncher(tab);
      case 'setBase': {
        const known = tab.repo ? [...tab.repo.branches, tab.repo.base] : [];
        if (typeof first === 'string' && known.includes(first)) await tab.refresh(first);
        return;
      }
      case 'refresh':
        // only the page in sight: a tab behind another, or one showing its review, has no picker to keep current
        if (tab === this.tabs.active && tab.showing === 'launcher') await tab.poll();
        return;
      case 'open': {
        const choice = parseChoice(first);
        if (choice) await tab.open(choice);
        return;
      }
      case 'cancel':
        return tab.cancel();
      case 'dismiss':
        return tab.dismiss();
      case 'back':
        return tab.back();
      case 'showRunning':
        return tab.showRunning();
      case 'recheck':
        await this.deps.themes.load().catch(() => {});
        return this.show();
      case 'settings':
        return this.openSettings();
      case 'install':
      case 'uninstall':
        if (first === 'cli' || first === 'skills') await this.setup(tab, call, first);
        return;
    }
  }

  private async setup(tab: Tab, action: 'install' | 'uninstall', part: SetupPart): Promise<void> {
    const what = part === 'cli' ? 'the lens command' : 'the agent skills';
    try {
      const done = await (action === 'install' ? install : uninstall)(this.deps.setup, part);
      tab.set({ kind: 'done', label: done });
    } catch (error) {
      const label = action === 'install' ? `Couldn't install ${what}` : `Couldn't remove ${what}`;
      tab.set({ kind: 'failed', label, detail: (error as Error).message });
    }
  }

  /** For the menu and the smoke run: the views of the tab in front. */
  frontViews(): { launcher: WebContentsView; review: WebContentsView | null } | null {
    const active = this.tabs.active;
    return active ? (this.views.get(active.id) ?? null) : null;
  }
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}
