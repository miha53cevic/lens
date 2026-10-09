// The session: the theme, reload, end.

import type { ViewerPayload } from '../../server.ts';
import { getState, update } from '../store.ts';
import type { ViewFile } from '../shared.ts';
import { firstTreeFile } from '../model/tree.ts';
import { withTab } from './tabs.ts';

type ThemeTokens = { theme: string; fg: string; bg: string; accent: string; tokens: ViewFile['tokens'][] };

export async function switchTheme(theme: string): Promise<boolean> {
  update({ themeBusy: true });
  try {
    const response = await fetch('/api/tokens?theme=' + encodeURIComponent(theme));
    if (!response.ok) throw new Error('http ' + response.status);
    const entry: ThemeTokens = await response.json();
    update((state) => ({
      themeBusy: false,
      data: {
        ...state.data,
        theme: entry.theme,
        fg: entry.fg,
        bg: entry.bg,
        accent: entry.accent,
        // a theme from the saved choice that isn't in the menu yet joins it
        themes: state.data.themes.some((swatch) => swatch.name === entry.theme)
          ? state.data.themes
          : [...state.data.themes, { name: entry.theme, bg: entry.bg, accent: entry.accent }],
        files: state.data.files.map((file, fileIndex) => ({ ...file, tokens: entry.tokens[fileIndex] })),
      },
    }));
    return true;
  } catch (error) {
    console.error('theme switch failed:', error);
    update({ themeBusy: false });
    return false;
  }
}

export async function refresh(): Promise<void> {
  update({ refreshing: true });
  try {
    const response = await fetch('/api/refresh?theme=' + encodeURIComponent(getState().data.theme));
    if (!response.ok) throw new Error('http ' + response.status);
    const data: ViewerPayload = await response.json();
    update((state) => {
      const activePath = state.data.files[state.active]?.file;
      const pathAt = (fileIndex: number) =>
        data.files.findIndex((file) => file.file === state.data.files[fileIndex]?.file);
      // tabs survive a refresh by path; files gone from the new analysis drop out
      let tabs = state.tabs
        .map((tab) => ({ index: pathAt(tab.index), pinned: tab.pinned }))
        .filter((tab) => tab.index >= 0);
      let active = data.files.findIndex((file) => file.file === activePath);
      if (active === -1) active = tabs[0]?.index ?? firstTreeFile({ ...state, data });
      if (active >= 0) tabs = withTab(tabs, active, active);
      return {
        data,
        tabs,
        active,
        refreshing: false,
        expandedGaps: new Set(), // keyed by line numbers, which an edit moves
        foldOverrides: new Map(),
        // the summary went away (e.g. a refresh in path mode): back to the code
        view: data.summary ? state.view : 'code',
      };
    });
  } catch (error) {
    console.error('refresh failed:', error);
    update({ refreshing: false });
  }
}

export async function endSession(): Promise<void> {
  try {
    await fetch('/api/shutdown', { method: 'POST' });
  } catch {
    /* the server may drop the connection while dying — that's success */
  }
  update({ ended: true });
}
