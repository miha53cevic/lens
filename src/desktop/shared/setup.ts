// What Setup asks of the reader, for each page that points at it: the strip's dot, the status bar's
// notice and the row itself all say the same thing.

import type { SetupItem, SetupPart } from './api.ts';

export const SETUP_NAMES: Record<SetupPart, string> = { cli: 'the lens command', skills: 'the agent skills' };

/** A part the app can fix with a click: not there, or there but pointing at another copy of the app. */
export function needsYou(item: SetupItem): boolean {
  return item.state === 'missing' || item.state === 'stale';
}

/** What a part that needs you lacks, as a sentence's end: "isn't installed", "is out of date". */
export function whatsWrong(part: SetupPart, item: SetupItem): string {
  const plural = part === 'skills';
  if (item.state === 'stale') return plural ? 'are out of date' : 'is out of date';
  return plural ? "aren't installed" : "isn't installed";
}

/** One line for whatever needs you, or null when nothing does. */
export function setupNotice(setup: Record<SetupPart, SetupItem>): string | null {
  const parts = (Object.keys(setup) as SetupPart[]).filter((part) => needsYou(setup[part]));
  if (parts.length === 0) return null;
  if (parts.length > 1) return `${parts.length} things need setting up`;
  const [part] = parts;
  const name = SETUP_NAMES[part];
  return name[0].toUpperCase() + name.slice(1) + ' ' + whatsWrong(part, setup[part]);
}
