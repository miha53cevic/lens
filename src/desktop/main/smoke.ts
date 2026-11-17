// A scripted run of the real app, for `bun run app:smoke` (scripts/smoke.ts): it opens a repository, starts
// a review, opens Setup and switches the theme, saving a picture of each page and what it
// found. The script then starts the app a second time on the same data, and that run checks that
// the window and its tab came back as the first run left them.
// It is how a build is checked without a person clicking through it.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, type WebContents } from 'electron';
import type { Themes } from './themes.ts';
import type { AppWindow } from './window.ts';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Where the first run leaves the window, for the second to find it again. */
const LEFT_AT = { x: 90, y: 70, width: 1180, height: 780 };

function loaded(contents: WebContents): Promise<void> {
  if (!contents.isLoading()) return Promise.resolve();
  return new Promise((resolve) => contents.once('did-finish-load', () => resolve()));
}

async function until(what: string, check: () => boolean, timeout = 30_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await pause(50);
  }
}

export async function runSmoke(window: AppWindow, themes: Themes, repo: string): Promise<void> {
  const out = process.env.LENS_APP_SMOKE_OUT ?? join(app.getPath('temp'), 'lens-app-smoke');
  mkdirSync(out, { recursive: true });
  const report: Record<string, unknown> = { ok: false, steps: [] as string[] };
  const steps = report.steps as string[];
  const shot = async (name: string, contents: WebContents) => {
    await loaded(contents);
    await pause(350); // React's render, and the paint after it
    // a page that has just come to the front may not have a frame to give yet
    for (let attempt = 0; ; attempt++) {
      try {
        writeFileSync(join(out, name + '.png'), (await contents.capturePage()).toPNG());
        break;
      } catch (error) {
        if (attempt === 5) throw error;
        await pause(300);
      }
    }
    steps.push(name);
  };
  const strip = window.win.webContents;
  const read = <T>(contents: WebContents, code: string) => contents.executeJavaScript(code, true) as Promise<T>;

  // the second run: the app as the first one left it
  if (process.env.LENS_APP_SMOKE_PHASE === 'reopen') {
    try {
      await until('the window to show', () => window.win.isVisible());
      await until('the reopened tab to start its review', () => Boolean(window.tabs.active?.reviewUrl));
      await shot('7-reopened-review', window.frontViews()!.review!.webContents);
      await shot('7-reopened-strip', strip);
      report.tabs = window.tabs.strip().tabs.map((tab) => [tab.title, tab.detail]);
      report.bounds = window.win.getBounds();
      const [tab] = window.tabs.all;
      report.ok =
        window.tabs.all.length === 1 &&
        tab.strip().detail === 'working tree' &&
        JSON.stringify(report.bounds) === JSON.stringify(LEFT_AT);
    } catch (error) {
      report.error = (error as Error).stack ?? String(error);
    }
    writeFileSync(join(out, 'reopen.json'), JSON.stringify(report, null, 2) + '\n');
    window.win.close();
    return;
  }

  try {
    await until('the window to show', () => window.win.isVisible());
    const tab = window.tabs.active!;
    await shot('1-start', window.frontViews()!.launcher.webContents);
    await shot('1-strip', strip);

    await tab.openFolder(repo);
    if (tab.screen !== 'picker') throw new Error('the picker did not open: ' + JSON.stringify(tab.status));
    await shot('2-picker', window.frontViews()!.launcher.webContents);

    await tab.open({ kind: 'diff', range: 'worktree' });
    if (!tab.reviewUrl) throw new Error('the review did not open: ' + JSON.stringify(tab.status));
    const viewer = window.frontViews()!.review!.webContents;
    await shot('3-review', viewer);
    await shot('3-strip', strip);
    // the viewer must not be able to reach the app
    report.viewerSeesApp = await read<boolean>(
      viewer,
      "typeof window.lensApp !== 'undefined' || typeof require !== 'undefined'",
    );
    report.viewerTitle = await read<string>(viewer, 'document.title');
    // the strip's theme button is the one: the review's own is hidden, its menu still in the page
    report.viewerThemeButton = await read<string>(
      viewer,
      "getComputedStyle(document.getElementById('theme-btn')).display + ' / ' + document.querySelectorAll('[id^=theme-]:not(#theme-btn)').length",
    );
    // the tab's picker lies under its review: a page out of sight says so, and its polls stop (poll.ts)
    report.pageUnderReview = await read<string>(window.frontViews()!.launcher.webContents, 'document.visibilityState');

    // where the OS says its window buttons are, and what the strip made of it
    report.strip = await read(
      strip,
      `(() => {
        const probe = document.createElement('div');
        probe.style.cssText = 'position:fixed;left:env(titlebar-area-x, -1px);width:env(titlebar-area-width, -1px)';
        document.body.append(probe);
        const rect = probe.getBoundingClientRect();
        probe.remove();
        const style = getComputedStyle(document.querySelector('[data-part="tabstrip"]'));
        return { titlebarAreaX: rect.left, titlebarAreaWidth: rect.width, paddingLeft: style.paddingLeft, paddingRight: style.paddingRight, innerWidth };
      })()`,
    );

    window.openSetup();
    await shot('4-setup', window.frontViews()!.launcher.webContents);
    // the design system's sandbox, which Setup leads to: a tab of its own
    window.openSandbox();
    await shot('4-sandbox', window.frontViews()!.launcher.webContents);
    window.openSetup();

    // the strip's theme menu: the viewer's, in a view of its own over the window
    await read(strip, "document.getElementById('theme-btn').click()");
    await until('the theme menu to open', () => window.menuOpen);
    await pause(300);
    report.themeMenu = await read(
      window.menuContents,
      `(() => {
        const menu = document.getElementById('theme-menu');
        const rect = menu.getBoundingClientRect();
        return { open: menu.matches(':popover-open'), items: menu.querySelectorAll('[role=menuitem]').length,
          right: Math.round(innerWidth - rect.right), top: Math.round(rect.top), pageBackground: getComputedStyle(document.body).backgroundColor };
      })()`,
    );
    await shot('5-theme-menu', window.menuContents);
    report.themeMenuStayedOpen = window.menuOpen;
    await read(window.menuContents, "document.getElementById('theme-github-light').click()");
    await until('the app to take the theme', () => themes.current.name === 'github-light');
    report.themeMenuClosed = !window.menuOpen;
    await pause(900); // the viewer fetches the theme's tokens
    await shot('5-setup-light', window.frontViews()!.launcher.webContents);
    await shot('5-strip-light', strip);
    window.selectTab(tab.id);
    report.viewerTheme = await read<string>(viewer, 'document.documentElement.dataset.appearance');
    // a page that was behind another takes a moment to count as in sight, and gives no fresh picture before
    for (let waited = 0; waited < 5000 && (await read<string>(viewer, 'document.visibilityState')) !== 'visible';) {
      await pause(100);
      waited += 100;
    }
    await shot('5-review-light', viewer);
    await themes.pick('vesper');

    // End session in the viewer: the tab falls back to its picker
    await read(viewer, "fetch('/api/shutdown', { method: 'POST' }).then(() => true)");
    await until('the tab to fall back to the picker', () => tab.reviewUrl === null);
    await shot('6-picker-after-end', window.frontViews()!.launcher.webContents);

    // left with a review running and the window somewhere of its own: the second run finds both
    await tab.open({ kind: 'diff', range: 'worktree' });
    if (!tab.reviewUrl) throw new Error('the review did not open again: ' + JSON.stringify(tab.status));
    window.win.setBounds(LEFT_AT);
    await pause(200);
    report.ok =
      report.viewerSeesApp === false &&
      String(report.viewerThemeButton).startsWith('none / ') &&
      report.themeMenuClosed === true;
  } catch (error) {
    report.error = (error as Error).stack ?? String(error);
  }
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  window.win.close();
}
