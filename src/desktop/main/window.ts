// The window: the tab strip (the window's own page) with one embedded view per tab under it.
// A tab has a launcher view, the app's own page, and while a review runs, a viewer view on the
// address the CLI serves. Tab logic is in tab.ts; this file gives it real views.

import { homedir } from 'node:os';
import { basename } from 'node:path';
import {
  BrowserWindow,
  WebContentsView,
  dialog,
  ipcMain,
  screen,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from 'electron';
import {
  LAUNCHER_CALLS,
  MENU_CALLS,
  STRIP_CALLS,
  type LauncherCall,
  type LauncherState,
  type MenuCall,
  type MenuState,
  type SetupPart,
  type StripCall,
  type StripState,
} from '../shared/api.ts';
import { parseChoice } from '../shared/choice.ts';
import { MIN_SIZE, placeWindow } from './bounds.ts';
import type { LensCli } from './cli.ts';
import { tildePath } from './display.ts';
import { APP_ORIGIN, allowOrigin, appPagePreferences, isAppPage, viewerPreferences } from './security.ts';
import { install, setupState, uninstall, type SetupEnv } from './setup.ts';
import type { Session, Store } from './store.ts';
import { Tab, type OwnScreen, type TabHost } from './tab.ts';
import { TabList } from './tabs.ts';
import type { Themes } from './themes.ts';

/** The strip's height: the views start under it. The shell's stylesheet has the same number. */
export const STRIP_HEIGHT = 40;

/**
 * A review's own theme button, hidden: in the app the strip's is the one, on every tab. The menu
 * behind it stays in the page, since that is how a review takes a theme (`themeChanged`).
 */
const HIDE_VIEWER_THEME_BUTTON = '#theme-btn { display: none !important; }';

/** Between the strip's button and its menu, as ui/Menu leaves under its own button. */
const MENU_GAP = 6;

/** How long the window stands still before its place is written down: not on every pixel of a drag. */
const PLACE_SAVE_MS = 400;

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
  /**
   * The strip's theme menu: a clear page in a view over the whole window, there while the menu is
   * open. The strip's own page is 40px high and lies under the tabs' views, so it can't show one.
   */
  private readonly menu: WebContentsView;
  /** Where that menu hangs (its right edge, its top); null while it is closed */
  private menuAt: MenuState['at'] = null;
  private readonly deps: WindowDeps;
  private closing = false;
  /** The tabs of the last run are being read again: what is open isn't the session to keep yet */
  private restoring = false;
  private placeTimer: ReturnType<typeof setTimeout> | null = null;
  /** The pages' own background in the theme of the moment, as the strip's page measured it */
  private pageBackground: string | null = null;

  constructor(deps: WindowDeps) {
    this.deps = deps;
    const { bg, fg } = deps.themes.current;
    // where it was when the app last ran, as far as a display is still there
    const place = deps.store.window();
    const primary = screen.getPrimaryDisplay();
    const others = screen.getAllDisplays().filter((display) => display.id !== primary.id);
    this.win = new BrowserWindow({
      ...placeWindow(
        place,
        [primary, ...others].map((display) => display.workArea),
      ),
      minWidth: MIN_SIZE.width,
      minHeight: MIN_SIZE.height,
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
    this.menu = new WebContentsView({ webPreferences: appPagePreferences(deps.preload) });
    this.menu.setBackgroundColor('#00000000');
    allowOrigin(this.menu.webContents, APP_ORIGIN);
    // loaded now, in the window only while it is open: a view over the others, even a hidden one, is in their way
    void this.menu.webContents.loadURL(APP_ORIGIN + '/menu.html');
    this.win.once('ready-to-show', () => {
      // maximizing also shows the window: only now, when there is a page to show
      if (place?.maximized) this.win.maximize();
      this.win.show();
    });
    this.win.on('resize', () => {
      this.closeMenu();
      this.layout();
      this.placeChanged();
    });
    this.win.on('move', () => this.placeChanged());
    this.win.on('maximize', () => this.savePlace());
    this.win.on('unmaximize', () => this.savePlace());
    this.win.on('enter-full-screen', () => this.sendStrip());
    this.win.on('leave-full-screen', () => this.sendStrip());
    // nothing of a review outlives the window: its tabs stop their CLI processes first
    this.win.on('close', (event) => {
      if (this.closing) return;
      event.preventDefault();
      this.savePlace();
      this.closing = true;
      void Promise.allSettled(this.tabs.all.map((tab) => tab.close())).then(() => this.win.destroy());
    });
    this.listen();
    this.reopen(deps.store.session());
  }

  // ---- the window's place ----

  /** The window moved or changed size: written down once it stands still. */
  private placeChanged(): void {
    if (this.placeTimer) clearTimeout(this.placeTimer);
    this.placeTimer = setTimeout(() => this.savePlace(), PLACE_SAVE_MS);
  }

  /** Its place when it isn't maximized (what it returns to), and whether it is. Full screen isn't kept. */
  private savePlace(): void {
    if (this.placeTimer) clearTimeout(this.placeTimer);
    this.placeTimer = null;
    if (this.closing || this.win.isDestroyed()) return;
    this.deps.store.setWindow({ ...this.win.getNormalBounds(), maximized: this.win.isMaximized() });
  }

  // ---- tabs ----

  /**
   * Opens with the tabs the app had when it last ran, or with Start. Each stored tab is checked
   * before it counts (Tab.restore): one whose repository is gone gets no tab. Only the tab in
   * front starts its review; the others start when they are first clicked.
   */
  private reopen(session: Session | null): void {
    // a repository has one tab: a file that names one twice gets it once
    const stored = (session?.tabs ?? []).filter(
      (tab, index, all) => all.findIndex((other) => other.root === tab.root) === index,
    );
    if (!session || stored.length === 0) return void this.addTab('start');
    this.restoring = true;
    const tabs = stored.map(() => this.addTab('start'));
    const front = stored.findIndex((tab) => tab.root === session.tabs[session.active]?.root);
    // a tab that isn't kept was in front (Start, Settings, the sandbox): a new one is, again
    if (front === -1) this.addTab('start');
    else this.selectTab(tabs[front].id);
    void Promise.all(tabs.map((tab, index) => tab.restore(stored[index].root, stored[index].choice))).then(
      async (reopened) => {
        for (const [index, tab] of tabs.entries()) if (!reopened[index]) await this.closeTab(tab.id);
        this.restoring = false;
        this.show();
      },
    );
  }

  /** Writes down what is open, for the next run. Not while the window closes: ending the reviews isn't leaving them. */
  private saveSession(): void {
    if (!this.closing && !this.restoring) this.deps.store.setSession(this.tabs.session());
  }

  addTab(screen: OwnScreen | 'start'): Tab {
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
    this.openOwn('settings');
  }

  /** The design system's sandbox: Settings leads to it. */
  openSandbox(): void {
    this.openOwn('sandbox');
  }

  /** A screen that has one tab: that tab to the front, or a new one for it. */
  private openOwn(screen: OwnScreen): void {
    const open = this.tabs.onScreen(screen);
    if (open) this.selectTab(open.id);
    else this.addTab(screen);
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
    if (this.win.contentView.children.includes(view)) this.win.contentView.removeChildView(view);
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
      // not from under the open theme menu: its keys are its own
      if (front && !this.menuAt && !front.webContents.isFocused() && this.win.isFocused()) front.webContents.focus();
    }
    // the open theme menu stays above a view that came in under it
    if (this.menuAt) this.win.contentView.addChildView(this.menu);
  }

  /** After anything a tab shows changed: its page, the strip, which view is in front. */
  private show(): void {
    this.closeMenu();
    const active = this.tabs.active;
    if (active) this.sendLauncher(active);
    this.sendStrip();
    this.layout();
    this.saveSession();
    // a reopened tab, in front for the first time: its review starts now
    if (!this.restoring) active?.shown();
  }

  // ---- TabHost: what a tab asks of the window ----

  changed(tab: Tab): void {
    this.sendLauncher(tab);
    this.sendStrip();
    this.layout();
    this.saveSession();
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
      view.webContents.on('dom-ready', () => {
        void view.webContents.insertCSS(HIDE_VIEWER_THEME_BUTTON).catch(() => {});
      });
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

  private menuState(): MenuState {
    const { themes } = this.deps;
    return { theme: themes.current, themes: themes.all, at: this.menuAt };
  }

  private sendMenu(): void {
    const { webContents } = this.menu;
    if (!webContents.isDestroyed()) webContents.send('menu:changed', this.menuState());
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
    this.sendMenu();
  }

  // ---- the strip's theme menu ----

  get menuOpen(): boolean {
    return this.menuAt !== null;
  }

  /** For the smoke run: the menu's page. */
  get menuContents(): WebContentsView['webContents'] {
    return this.menu.webContents;
  }

  /** Under the strip's button, over everything else; the button again closes it. */
  private toggleMenu(right: number, bottom: number): void {
    if (this.menuAt) return this.closeMenu();
    const [width, height] = this.win.getContentSize();
    this.menuAt = { right: Math.round(right), top: Math.round(bottom) + MENU_GAP };
    // added last: above every tab's view
    this.win.contentView.addChildView(this.menu);
    this.menu.setBounds({ x: 0, y: 0, width, height });
    // its keys: Esc, and the arrows
    this.menu.webContents.focus();
    this.sendMenu();
  }

  private closeMenu(): void {
    if (!this.menuAt) return;
    this.menuAt = null;
    this.win.contentView.removeChildView(this.menu);
    this.sendMenu();
    // the focus goes back to the tab's page
    this.layout();
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

  private isMenu(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
    return event.sender === this.menu.webContents && isAppPage(event.sender, event.senderFrame?.url);
  }

  private listen(): void {
    ipcMain.handle('strip:state', (event) => (this.isStrip(event) ? this.stripState() : null));
    ipcMain.handle('menu:state', (event) => (this.isMenu(event) ? this.menuState() : null));
    for (const call of MENU_CALLS) {
      ipcMain.on('menu:' + call, (event, ...args: unknown[]) => {
        if (this.isMenu(event)) this.menuCall(call, args);
      });
    }
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
        if (typeof first === 'number' && typeof second === 'number') this.toggleMenu(first, second);
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

  private menuCall(call: MenuCall, [first]: unknown[]): void {
    const { themes } = this.deps;
    switch (call) {
      case 'pick':
        // only a theme the menu was given: a page can't name another
        if (typeof first === 'string' && themes.all.some((theme) => theme.name === first)) void themes.pick(first);
        return this.closeMenu();
      case 'close':
        return this.closeMenu();
    }
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
      case 'sandbox':
        return this.openSandbox();
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
