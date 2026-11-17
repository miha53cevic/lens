// What Setup asks of the reader: the strip's dot and the rows themselves say the same thing.

import type { AgentInfo, SetupItem, SetupPart } from './api.ts';

export const SETUP_NAMES: Record<SetupPart, string> = { cli: 'the lens command', skills: 'the agent skills' };

/** A part the app can fix with a click: not there, or there but pointing at another copy of the app. */
export function needsYou(item: SetupItem): boolean {
  return item.state === 'missing' || item.state === 'stale';
}

/** The picked agent can't run: not installed, or logged out. One lens can't read the state of asks nothing. */
export function agentNeedsYou(agent: AgentInfo | null): boolean {
  return agent?.problem === 'missing' || agent?.problem === 'logged-out';
}
