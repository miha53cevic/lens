// The desktop app's main process. It holds no lens logic: it starts the same CLI you would type,
// shows that CLI's viewer in a tab, and offers screens to pick what the CLI should open.

import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { app, dialog } from 'electron';
import { compiledCli, findBun, sourceCli, type LensCli } from './cli.ts';
import { setAppMenu } from './menu.ts';
import { lockDown, registerAppScheme, viewerSession } from './security.ts';
import { setWindowsUserPath, terminalPath, type SetupEnv } from './setup.ts';
import { runSmoke } from './smoke.ts';
import { openStore } from './store.ts';
import { Themes } from './themes.ts';
import { Updater } from './update.ts';
import { UiZoom } from './zoom.ts';
import { AppWindow } from './window.ts';
import { SOURCE_URL } from '../shared/release.ts';

// this file, bundled, is dist/main.mjs: the pages and the preload sit next to it
const distDir = import.meta.dirname;
// the CLI: the checkout in development, the app's resources once installed
const lensRoot = app.isPackaged ? join(process.resourcesPath, 'lens') : join(distDir, '..');

// a folder of its own for the app's data (tests and the smoke run point it somewhere else)
if (process.env.LENS_APP_DATA) app.setPath('userData', process.env.LENS_APP_DATA);

// The smoke run takes pictures of its pages. Chromium stops drawing a window that another one
// covers, and a covered window then has no picture to give: keep drawing for the tour.
if (process.env.LENS_APP_SMOKE) {
  app.commandLine.appendSwitch('disable-features', 'MacWebContentsOcclusion,CalculateNativeWinOcclusion');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
}

registerAppScheme();

let window: AppWindow | null = null;

/** What runs lens: the compiled lens the packed app carries, or bun on the checkout's sources. */
function lensCli(): LensCli {
  if (app.isPackaged) return compiledCli(lensRoot);
  const bun = findBun();
  if (!bun) throw new Error("bun isn't installed: from a checkout, the app runs lens's sources with it (npm i -g bun)");
  return sourceCli(lensRoot, bun);
}

async function start(): Promise<void> {
  const cli = lensCli();
  const themes = new Themes(cli, viewerSession(), () => window?.themeChanged());
  const zoom = new UiZoom(viewerSession(), () => window?.zoomChanged());
  lockDown(
    distDir,
    () => themes.current,
    () => zoom.current,
  );
  await Promise.all([themes.load(), zoom.load()]);
  // lens's version (Electron's own is what About shows from a checkout), and where its source is: the AGPL
  // has every copy say so
  app.setAboutPanelOptions({
    applicationName: 'lens',
    ...(themes.version && { applicationVersion: themes.version }),
    copyright: 'AGPL-3.0 · source at ' + SOURCE_URL,
    website: SOURCE_URL,
  });
  themes.watch();
  zoom.watch();

  const setup: SetupEnv = {
    command: [cli.command, ...cli.args],
    lensRoot,
    home: homedir(),
    platform: process.platform,
    env: process.env,
    pathDirs: await terminalPath(process.env, process.platform),
    setUserPath: process.platform === 'win32' ? setWindowsUserPath : undefined,
  };
  const updater = new Updater({
    current: app.getVersion(),
    packed: app.isPackaged,
    platform: process.platform,
    arch: process.arch,
    execPath: process.execPath,
    pid: process.pid,
    tempDir: app.getPath('temp'),
    fetch: (url, init) => fetch(url, init),
    // its own process group, so quitting the app leaves it running to swap the bundle
    startScript: (path) => spawn('/bin/sh', [path], { detached: true, stdio: 'ignore' }).unref(),
    quit: () => app.quit(),
    changed: () => window?.updateChanged(),
  });
  window = new AppWindow({
    cli,
    store: openStore(join(app.getPath('userData'), 'state.json')),
    themes,
    zoom,
    preload: join(distDir, 'preload.cjs'),
    setup,
    updater,
  });
  setAppMenu(window);
  if (process.env.LENS_APP_SMOKE) void runSmoke(window, themes, process.env.LENS_APP_SMOKE);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!window) return;
    if (window.win.isMinimized()) window.win.restore();
    window.win.focus();
  });
  // one window, and reviews run only while it is open: closing it ends the app on every platform
  app.on('window-all-closed', () => app.quit());
  void app
    .whenReady()
    .then(start)
    .catch((error: Error) => {
      // the CLI didn't answer: without it there is nothing to show, so say why and stop
      const out = process.env.LENS_APP_SMOKE_OUT;
      if (out) {
        mkdirSync(out, { recursive: true });
        writeFileSync(join(out, 'report.json'), JSON.stringify({ ok: false, error: error.stack ?? String(error) }));
      } else {
        dialog.showErrorBox("lens couldn't start", error.message);
      }
      app.exit(1);
    });
}
