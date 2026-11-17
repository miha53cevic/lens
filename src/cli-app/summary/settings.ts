import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { LensConfig } from '../model.ts';
import type { ViewSettings } from '../api/contract.ts';
import { writeAtomic } from './store.ts';

// The reader's own switches, set from the viewer: ~/.lens/settings.json, the same in every
// repository (what is a repository's own stays in its .lens/: summaries, marks, notes; timings are the machine's, timings.ts).
// A switch here never edits a checked-in .lens.json; it wins over it. `view` is how the reader
// left the viewer (its view settings, its panels): the browser keeps none of it.

export interface LocalSettings {
  buildPreviews?: boolean;
  selfChecks?: boolean;
  planTab?: boolean;
  typescriptLsp?: boolean;
  timings?: boolean;
  view?: ViewSettings;
}

const VIEW_SWITCHES = [
  'hideTests',
  'hunksOnly',
  'fullUnits',
  'wordDiff',
  'sideBySide',
  'navCollapsed',
  'askOpen',
] as const;
const VIEW_WIDTHS = ['navWidth', 'askWidth'] as const;
/** px: past these a width is no panel's */
const WIDTH_MIN = 100;
const WIDTH_MAX = 2000;

const isLevel = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= -1;

/** The view settings in `raw` that check, and the names of those that don't. */
export function checkView(raw: unknown): { view: ViewSettings; bad: string[] } {
  const given = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const view: ViewSettings = {};
  const bad: string[] = [];
  for (const name of VIEW_SWITCHES) {
    if (given[name] === undefined) continue;
    if (typeof given[name] === 'boolean') view[name] = given[name];
    else bad.push(name);
  }
  for (const name of VIEW_WIDTHS) {
    const width = given[name];
    if (width === undefined) continue;
    if (Number.isInteger(width) && (width as number) >= WIDTH_MIN && (width as number) <= WIDTH_MAX)
      view[name] = width as number;
    else bad.push(name);
  }
  const foldLevel = given.foldLevel as { level?: unknown; base?: unknown } | null | undefined;
  if (foldLevel === null) view.foldLevel = null;
  else if (foldLevel !== undefined) {
    if (typeof foldLevel === 'object' && isLevel(foldLevel.level) && isLevel(foldLevel.base))
      view.foldLevel = { level: foldLevel.level, base: foldLevel.base };
    else bad.push('foldLevel');
  }
  return { view, bad };
}

/** The reader's own folder: ~/.lens (%USERPROFILE%\\.lens on Windows), or LENS_HOME (the tests' own) */
export function lensHome(): string {
  return process.env.LENS_HOME || join(homedir(), '.lens');
}

export function settingsPath(): string {
  return join(lensHome(), 'settings.json');
}

/** What shows the file selected in the system's file manager: Finder, Explorer, else its folder opened. */
export function revealCommand(path: string, platform: NodeJS.Platform): [string, string[]] {
  if (platform === 'darwin') return ['open', ['-R', path]];
  // one argument: Explorer reads `/select,` and the path as one
  if (platform === 'win32') return ['explorer.exe', ['/select,' + path]];
  return ['xdg-open', [dirname(path)]];
}

/**
 * Settings' footer: the settings file shown in Finder or Explorer, made first when nothing was set
 * yet (an empty one, as reading finds no file). The page never names the path: it's always this one.
 */
export function revealSettings(): void {
  const path = settingsPath();
  if (!existsSync(path)) {
    mkdirSync(lensHome(), { recursive: true });
    writeFileSync(path, '{}\n');
  }
  revealFile(path);
}

/** A file lens picked, shown in Finder or Explorer. LENS_NO_REVEAL (the tests') leaves the file manager closed. */
export function revealFile(path: string): void {
  if (process.env.LENS_NO_REVEAL) return;
  const [command, args] = revealCommand(path, process.platform);
  const child = spawn(command, args, { stdio: 'ignore', detached: true, windowsHide: true });
  child.on('error', () => console.log(`lens: couldn't show ${path} — it is there to open yourself`));
  child.unref();
}

export function readSettings(): LocalSettings {
  const path = settingsPath();
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    return {
      ...(typeof raw?.buildPreviews === 'boolean' ? { buildPreviews: raw.buildPreviews } : {}),
      ...(typeof raw?.selfChecks === 'boolean' ? { selfChecks: raw.selfChecks } : {}),
      ...(typeof raw?.planTab === 'boolean' ? { planTab: raw.planTab } : {}),
      ...(typeof raw?.typescriptLsp === 'boolean' ? { typescriptLsp: raw.typescriptLsp } : {}),
      ...(typeof raw?.timings === 'boolean' ? { timings: raw.timings } : {}),
      // a hand-edited value that doesn't check is skipped, as the config's are
      ...(raw?.view ? { view: checkView(raw.view).view } : {}),
    };
  } catch {
    return {};
  }
}

export function writeSettings(patch: LocalSettings): LocalSettings {
  const saved = readSettings();
  const next = { ...saved, ...patch };
  if (patch.view) {
    // the view's settings change one at a time, and a null is one forgotten
    const view: Record<string, unknown> = { ...saved.view, ...patch.view };
    for (const [name, value] of Object.entries(view)) if (value === null) delete view[name];
    next.view = view as ViewSettings;
  }
  mkdirSync(lensHome(), { recursive: true });
  writeAtomic(settingsPath(), JSON.stringify(next, null, 2) + '\n');
  return next;
}

/** Whether summary mode asks for previews and sequences: the reader's switch, else the config's. */
export function buildPreviewsOn(config: LensConfig): boolean {
  return readSettings().buildPreviews ?? config.buildPreviews;
}

/** Whether summary mode asks for questions the reader can check themselves with: off unless they turn it on. */
export function selfChecksOn(config: LensConfig): boolean {
  return readSettings().selfChecks ?? config.selfChecks;
}

/** Whether the viewer shows the Plan tab: the reader's switch, else the config's (off). */
export function planTabOn(config: LensConfig): boolean {
  return readSettings().planTab ?? config.planTab;
}

/** Whether the viewer asks TypeScript about the code under the pointer: the reader's switch, else the config's (off). */
export function typescriptLspOn(config: LensConfig): boolean {
  return readSettings().typescriptLsp ?? config.typescriptLsp;
}

/** Whether lens records how long its steps take (timings.ts): the reader's switch, else the config's (off). */
export function timingsOn(config: LensConfig): boolean {
  return readSettings().timings ?? config.timings;
}

/** How the reader left the viewer; nothing for what they never set. */
export function viewSettings(): ViewSettings {
  return readSettings().view ?? {};
}
