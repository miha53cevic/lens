import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LensConfig } from '../model.ts';
import { lensDir, writeAtomic } from './store.ts';

// The reader's own switches for this repository, set from the viewer: .lens/settings.json, in
// lens's ignored folder. A switch here never edits the checked-in .lens.json; it wins over it.

export interface LocalSettings {
  buildPreviews?: boolean;
  selfChecks?: boolean;
  planTab?: boolean;
  timings?: boolean;
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
    };
  } catch {
    return {};
  }
}

export function writeSettings(root: string, patch: LocalSettings): LocalSettings {
  const next = { ...readSettings(root), ...patch };
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
