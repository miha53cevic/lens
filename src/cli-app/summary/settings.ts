import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LensConfig } from '../model.ts';
import type { ViewSettings } from '../api/contract.ts';
import { lensDir, writeAtomic } from './store.ts';

// The reader's own switches for this repository, set from the viewer: .lens/settings.json, in
// lens's ignored folder. A switch here never edits the checked-in .lens.json; it wins over it.
// `view` is how the reader left the viewer here (its view settings, its panels): the browser keeps none of it.

export interface LocalSettings {
  buildPreviews?: boolean;
  selfChecks?: boolean;
  planTab?: boolean;
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

function settingsPath(root: string): string {
  return join(root, '.lens', 'settings.json');
}

export function readSettings(root: string): LocalSettings {
  const path = settingsPath(root);
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    return {
      ...(typeof raw?.buildPreviews === 'boolean' ? { buildPreviews: raw.buildPreviews } : {}),
      ...(typeof raw?.selfChecks === 'boolean' ? { selfChecks: raw.selfChecks } : {}),
      ...(typeof raw?.planTab === 'boolean' ? { planTab: raw.planTab } : {}),
      ...(typeof raw?.timings === 'boolean' ? { timings: raw.timings } : {}),
      // a hand-edited value that doesn't check is skipped, as the config's are
      ...(raw?.view ? { view: checkView(raw.view).view } : {}),
    };
  } catch {
    return {};
  }
}

export function writeSettings(root: string, patch: LocalSettings): LocalSettings {
  const saved = readSettings(root);
  const next = { ...saved, ...patch };
  if (patch.view) {
    // the view's settings change one at a time, and a null is one forgotten
    const view: Record<string, unknown> = { ...saved.view, ...patch.view };
    for (const [name, value] of Object.entries(view)) if (value === null) delete view[name];
    next.view = view as ViewSettings;
  }
  lensDir(root);
  writeAtomic(settingsPath(root), JSON.stringify(next, null, 2) + '\n');
  return next;
}

/** Whether summary mode asks for previews and sequences here: the reader's switch, else the config's. */
export function buildPreviewsOn(root: string, config: LensConfig): boolean {
  return readSettings(root).buildPreviews ?? config.buildPreviews;
}

/** Whether summary mode asks for questions the reader can check themselves with: off unless they turn it on. */
export function selfChecksOn(root: string, config: LensConfig): boolean {
  return readSettings(root).selfChecks ?? config.selfChecks;
}

/** Whether the viewer shows the Plan tab here: the reader's switch, else the config's (off). */
export function planTabOn(root: string, config: LensConfig): boolean {
  return readSettings(root).planTab ?? config.planTab;
}

/** Whether lens records how long its steps take here (timings.ts): the reader's switch, else the config's (off). */
export function timingsOn(root: string, config: LensConfig): boolean {
  return readSettings(root).timings ?? config.timings;
}

/** How the reader left the viewer here; nothing for what they never set. */
export function viewSettings(root: string): ViewSettings {
  return readSettings(root).view ?? {};
}
