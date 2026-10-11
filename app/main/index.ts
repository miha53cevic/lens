// The desktop app's main process. It holds no lens logic: it starts the same CLI you would type,
// shows that CLI's viewer in a tab, and offers screens to pick what the CLI should open.

import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { app, dialog } from 'electron';
import { lensCli } from './cli.ts';
import { setAppMenu } from './menu.ts';
import { lockDown, registerAppScheme, viewerSession } from './security.ts';
import { setWindowsUserPath, terminalPath, type SetupEnv } from './setup.ts';
import { runSmoke } from './smoke.ts';
import { openStore } from './store.ts';
import { Themes } from './themes.ts';
import { AppWindow } from './window.ts';

// this file, bundled, is app/dist/main.mjs: the pages and the preload sit next to it
const distDir = import.meta.dirname;
// the CLI's sources: the checkout in development, the app's resources once installed
const lensRoot = app.isPackaged ? join(process.resourcesPath, 'lens') : join(distDir, '..', '..');

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

async function start(): Promise<void> {
  lockDown(distDir);
  const cli = lensCli(lensRoot);
  const themes = new Themes(cli, viewerSession(), () => window?.themeChanged());
  await themes.load();
  themes.watch();

  const setup: SetupEnv = {
    execPath: process.execPath,
    lensRoot,
    home: homedir(),
    platform: process.platform,
    env: process.env,
    pathDirs: await terminalPath(process.env, process.platform),
    setUserPath: process.platform === 'win32' ? setWindowsUserPath : undefined,
  };
  window = new AppWindow({
    cli,
    store: openStore(join(app.getPath('userData'), 'state.json')),
    themes,
    preload: join(distDir, 'preload.cjs'),
    setup,
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
