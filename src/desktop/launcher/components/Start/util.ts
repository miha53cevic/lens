import type { Recent } from '../../../shared/api.ts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long ago `at` was, as a person says it: "just now", "5 min ago", "2h ago", "yesterday", "3 days ago". */
export function ago(at: number, now: number): string {
  const since = Math.max(0, now - at);
  if (since < MINUTE) return 'just now';
  if (since < HOUR) return Math.floor(since / MINUTE) + ' min ago';
  if (since < DAY) return Math.floor(since / HOUR) + 'h ago';
  if (since < 2 * DAY) return 'yesterday';
  if (since < 30 * DAY) return Math.floor(since / DAY) + ' days ago';
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** The keys that open a repository: ⌘O on a Mac, Ctrl O elsewhere (main.tsx listens for both). */
export function openKeys(platform: string): string {
  return platform === 'darwin' ? '⌘O' : 'Ctrl O';
}

/**
 * A repository in Start's list: the main worktree (a recent, or null when only its linked worktrees
 * were opened here), then the linked ones opened here, most recent first.
 */
export interface RecentGroup {
  main: string;
  /** The main worktree's name, for a group whose main worktree isn't a recent */
  name: string;
  recent: Recent | null;
  worktrees: Recent[];
}

/** The recents, a repository's worktrees under it, in the order its most recent one was opened. */
export function groupRecents(recents: Recent[]): RecentGroup[] {
  const groups = new Map<string, RecentGroup>();
  for (const recent of recents) {
    const main = recent.main ?? recent.root;
    let group = groups.get(main);
    if (!group) {
      group = { main, name: main.split('/').at(-1) ?? main, recent: null, worktrees: [] };
      groups.set(main, group);
    }
    if (recent.main === null) group.recent = recent;
    else group.worktrees.push(recent);
  }
  return [...groups.values()];
}
