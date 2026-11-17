// The code theme, for the whole app. It is the viewer's own choice: the cookie the viewer keeps
// its theme in (src/cli-app/theme.ts). The app reads that cookie, writes it when a theme is picked in
// the strip, and gets a theme's colors from `lens info`, so the color logic stays in the CLI.

import { homedir } from 'node:os';
import type { Session } from 'electron';
import { THEME_COOKIE } from '../../cli-app/theme.ts';
import type { AgentInfo, ThemeSwatch } from '../shared/api.ts';
import { lensInfo, type LensCli } from './cli.ts';

/** Where the viewer's cookie lives: its host, whatever the port (cookies don't keep ports apart). */
const VIEWER_URL = 'http://127.0.0.1';
const A_YEAR = 365 * 24 * 60 * 60;

export class Themes {
  /** The theme menu's themes */
  all: ThemeSwatch[] = [];
  current: ThemeSwatch = { name: 'vesper', bg: '#101010', fg: '#ffffff', accent: '#ffc799' };
  /** lens's version and git's, which the same `lens info` answers */
  version = '';
  git: string | null = null;
  /** The machine's picked agent and whether it can run, which the same `lens info` answers */
  agent: AgentInfo | null = null;
  private readonly cli: LensCli;
  private readonly cookies: Session['cookies'];
  private readonly onChange: () => void;

  constructor(cli: LensCli, viewer: Session, onChange: () => void) {
    this.cli = cli;
    this.cookies = viewer.cookies;
    this.onChange = onChange;
  }

  /** `lens info` outside any repository: the themes, with `name` among them. */
  private async ask(name?: string) {
    return lensInfo(this.cli, homedir(), { themes: true, theme: name });
  }

  private async saved(): Promise<string | null> {
    const [cookie] = await this.cookies.get({ url: VIEWER_URL, name: THEME_COOKIE });
    try {
      return cookie ? decodeURIComponent(cookie.value) : null;
    } catch {
      return null; // not something lens wrote
    }
  }

  /** At startup, when git is looked for again, and when Setup is opened (to show the agent as it is now). */
  async load(): Promise<void> {
    const saved = await this.saved();
    // a saved theme lens doesn't know anymore must not keep the app from starting
    const info = await this.ask(saved ?? undefined).catch(() => this.ask());
    this.version = info.version;
    this.git = info.git;
    this.agent = info.agent;
    this.all = info.themes ?? [];
    this.current = this.all.find((theme) => theme.name === (saved ?? info.theme)) ?? this.all[0] ?? this.current;
  }

  /** Follows the viewer: a theme picked in a review's own menu recolors the app too. */
  watch(): void {
    this.cookies.on('changed', (_event, cookie, _cause, removed) => {
      if (removed || cookie.name !== THEME_COOKIE || cookie.domain !== '127.0.0.1') return;
      void this.saved().then((name) => {
        if (name) void this.show(name);
      });
    });
  }

  private async show(name: string): Promise<void> {
    if (name === this.current.name) return;
    let swatch = this.all.find((theme) => theme.name === name);
    if (!swatch) {
      // a repository's own theme, picked in its viewer: not one of the menu's
      const info = await this.ask(name).catch(() => null);
      swatch = info?.themes?.find((theme) => theme.name === name);
      if (!swatch) return;
      this.all = [...this.all, swatch];
    }
    this.current = swatch;
    this.onChange();
  }

  /** A theme picked in the strip's menu: saved where the viewer reads it, then shown. */
  async pick(name: string): Promise<void> {
    if (!this.all.some((theme) => theme.name === name)) return;
    await this.cookies.set({
      url: VIEWER_URL,
      name: THEME_COOKIE,
      value: encodeURIComponent(name),
      path: '/',
      sameSite: 'lax',
      expirationDate: Date.now() / 1000 + A_YEAR,
    });
    await this.show(name);
  }
}
