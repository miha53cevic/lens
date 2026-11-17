// The window's tabs, in order, and which one is in front. No Electron here either.

import type { StripTab } from '../shared/api.ts';
import type { Session } from './store.ts';
import type { OwnScreen, Tab } from './tab.ts';

export class TabList {
  private tabs: Tab[] = [];
  private activeId = -1;
  private nextId = 1;

  newId(): number {
    return this.nextId++;
  }

  get all(): readonly Tab[] {
    return this.tabs;
  }

  get active(): Tab | null {
    return this.get(this.activeId);
  }

  get(id: number): Tab | null {
    return this.tabs.find((tab) => tab.id === id) ?? null;
  }

  /** Adds a tab after the one in front, and brings it to the front. */
  add(tab: Tab): void {
    const at = this.tabs.findIndex((other) => other.id === this.activeId);
    this.tabs.splice(at === -1 ? this.tabs.length : at + 1, 0, tab);
    this.activeId = tab.id;
  }

  select(id: number): boolean {
    if (!this.get(id) || id === this.activeId) return false;
    this.activeId = id;
    return true;
  }

  /** Takes a tab out. When it was in front, its right neighbor comes forward, else its left one. */
  remove(id: number): Tab | null {
    const at = this.tabs.findIndex((tab) => tab.id === id);
    if (at === -1) return null;
    const [removed] = this.tabs.splice(at, 1);
    if (id === this.activeId) this.activeId = (this.tabs[at] ?? this.tabs[at - 1])?.id ?? -1;
    return removed;
  }

  /** The tab that has this repository, if any: a repository gets one tab, as it gets one server. */
  withRepo(root: string, except?: Tab): Tab | null {
    return this.tabs.find((tab) => tab !== except && tab.repo?.root === root) ?? null;
  }

  /** The tab Setup or the sandbox has, if it is open: each gets one. */
  onScreen(screen: OwnScreen): Tab | null {
    return this.tabs.find((tab) => tab.screen === screen) ?? null;
  }

  /** What the app keeps between runs: the tabs that have a repository, in order, and which was in front. */
  session(): Session {
    const kept = this.tabs.filter((tab) => tab.stored !== null);
    return {
      tabs: kept.map((tab) => tab.stored!),
      active: kept.findIndex((tab) => tab.id === this.activeId),
    };
  }

  strip(): { tabs: StripTab[]; activeId: number } {
    return { tabs: this.tabs.map((tab) => tab.strip()), activeId: this.activeId };
  }
}
