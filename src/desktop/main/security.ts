// What the app's pages may do, in one place. The viewer shows code you didn't write and your
// agent's answers, so it is treated like any web page: sandboxed, no preload, held to its own
// address. The app's own pages are trusted, and still get only what they need.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, protocol, session, type Session, type WebContents, type WebPreferences } from 'electron';
import type { ThemeSwatch } from '../shared/api.ts';
import { themeAttributes } from '../shared/page.ts';

/** The app's own pages are served from its files under this scheme, never from the network. */
const APP_SCHEME = 'lens-app';
export const APP_ORIGIN = APP_SCHEME + '://app';
/** Reviews keep their cookies and localStorage in a profile of their own, apart from the app's pages. */
const VIEWER_PARTITION = 'persist:lens-viewer';

/** Only the app's own files run or style its pages: no inline or remote script, no requests anywhere. */
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  // React writes `style` attributes (a swatch's color)
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** Every file the scheme serves; anything else is not found. */
const APP_FILES: Record<string, string> = {
  'shell.html': 'text/html; charset=utf-8',
  'shell.js': 'text/javascript; charset=utf-8',
  'shell.css': 'text/css; charset=utf-8',
  'launcher.html': 'text/html; charset=utf-8',
  'launcher.js': 'text/javascript; charset=utf-8',
  'launcher.css': 'text/css; charset=utf-8',
};

/** Before the app is ready: the scheme behaves like https (its own origin, a CSP that means something). */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: APP_SCHEME, privileges: { standard: true, secure: true } }]);
}

export function viewerSession(): Session {
  return session.fromPartition(VIEWER_PARTITION);
}

/** A page of the app: the preload's narrow API, and nothing of Node. */
export function appPagePreferences(preload: string): WebPreferences {
  return {
    preload,
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    webviewTag: false,
    navigateOnDragDrop: false,
    spellcheck: false,
    devTools: !app.isPackaged,
  };
}

/** A review's viewer: no preload at all, so no way to reach the app. */
export function viewerPreferences(): WebPreferences {
  return {
    partition: VIEWER_PARTITION,
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    webviewTag: false,
    navigateOnDragDrop: false,
    spellcheck: false,
    devTools: !app.isPackaged,
  };
}

/** Copying to the clipboard (the viewer's copy buttons) is the one permission a page gets. */
function lockPermissions(target: Session): void {
  const allowed = (permission: string) => permission === 'clipboard-sanitized-write';
  target.setPermissionRequestHandler((_contents, permission, answer) => answer(allowed(permission)));
  target.setPermissionCheckHandler((_contents, permission) => allowed(permission));
  target.on('will-download', (event) => event.preventDefault());
}

/** Where each page is allowed to be: its own origin, set when it is created. */
const homeOrigin = new WeakMap<WebContents, string>();

export function allowOrigin(contents: WebContents, origin: string): void {
  homeOrigin.set(contents, origin);
}

/** Whether a call from a page really comes from one of the app's own. */
export function isAppPage(contents: WebContents, frameUrl: string | undefined): boolean {
  return homeOrigin.get(contents) === APP_ORIGIN && frameUrl !== undefined && originOf(frameUrl) === APP_ORIGIN;
}

function originOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    // a custom scheme's origin is "null" to URL: compare scheme and host instead
    return parsed.protocol + '//' + parsed.host;
  } catch {
    return null;
  }
}

/**
 * Once, when the app is ready: serve the app's pages, lock both sessions' permissions, and
 * hold every page (the ones created later too) to its own origin. A page is served in the theme
 * of the moment, so a new tab doesn't flash the default one before its script has run.
 */
export function lockDown(distDir: string, theme: () => ThemeSwatch): void {
  session.defaultSession.protocol.handle(APP_SCHEME, (request) => {
    const { host, pathname } = new URL(request.url);
    const name = pathname.slice(1);
    const type = host === 'app' && Object.hasOwn(APP_FILES, name) ? APP_FILES[name] : null;
    if (!type) return new Response('not found', { status: 404 });
    const file = readFileSync(join(distDir, name));
    const body = name.endsWith('.html')
      ? file.toString().replace('<html', () => '<html' + themeAttributes(theme()))
      : file;
    return new Response(body, {
      headers: {
        'content-type': type,
        'content-security-policy': CONTENT_SECURITY_POLICY,
        'x-content-type-options': 'nosniff',
      },
    });
  });
  lockPermissions(session.defaultSession);
  lockPermissions(viewerSession());

  app.on('web-contents-created', (_event, contents) => {
    // no page opens windows or embeds others; a page with no home origin goes nowhere at all
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-attach-webview', (event) => event.preventDefault());
    const stayHome = (event: { preventDefault(): void }, url: string) => {
      const home = homeOrigin.get(contents);
      if (home === undefined || originOf(url) !== home) event.preventDefault();
    };
    contents.on('will-navigate', stayHome);
    contents.on('will-redirect', stayHome);
    contents.on('will-frame-navigate', (event) => stayHome(event, event.url));
  });
}
