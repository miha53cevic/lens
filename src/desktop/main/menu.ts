// The application menu. It adds no shortcut the viewer uses: the viewer's plain keys and ⌘P reach
// the page. What it has is the system's own: copy and paste, close (the tab in front), quit, About.
// ⌘1–⌘9 aren't here either: they pick a tab from the keys themselves (tabKeys.ts), which number the tabs too.

import { Menu, app, type MenuItemConstructorOptions } from 'electron';
import type { AppWindow } from './window.ts';

export function setAppMenu(window: AppWindow): void {
  const isMac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Tab', click: () => void window.addTab('start') },
        { label: 'Settings…', click: () => window.openSettings() },
        { type: 'separator' },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            const active = window.tabs.active;
            if (active) void window.closeTab(active.id);
          },
        },
        ...(isMac ? [] : [{ type: 'separator' as const }, { role: 'quit' as const }]),
      ],
    },
    { role: 'editMenu' },
    { role: 'windowMenu' },
    // macOS has About in the app menu; elsewhere it goes under Help
    ...(isMac ? [] : [{ role: 'help' as const, submenu: [{ role: 'about' as const, label: 'About lens' }] }]),
  ];
  if (!app.isPackaged) {
    template.push({
      label: 'Develop',
      submenu: [
        {
          label: 'Inspect the Tab',
          click: () => {
            const views = window.frontViews();
            const active = window.tabs.active;
            const front = active?.showing === 'review' && views?.review ? views.review : views?.launcher;
            front?.webContents.openDevTools({ mode: 'detach' });
          },
        },
        { label: 'Inspect the Strip', click: () => window.win.webContents.openDevTools({ mode: 'detach' }) },
      ],
    });
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
