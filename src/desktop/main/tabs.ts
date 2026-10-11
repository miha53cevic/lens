// The window's tabs, in order, and which one is in front. No Electron here either.

import type { StripTab } from '../shared/api.ts';
import type { Tab } from './tab.ts';

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

  settings(): Tab | null {
    return this.tabs.find((tab) => tab.screen === 'settings') ?? null;
  }

  strip(): { tabs: StripTab[]; activeId: number } {
    return { tabs: this.tabs.map((tab) => tab.strip()), activeId: this.activeId };
  }
}
