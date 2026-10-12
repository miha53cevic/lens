// The session: the theme, reload, end.

import type { TokensResponse, ViewerPayload } from '../../cli-app/render/web/server.ts';
import { THEME_COOKIE } from '../../cli-app/theme.ts';
import { getState, update } from '../store.ts';
import { fileViewKey } from '../shared.ts';
import { changeNote } from '../model/status.ts';
import { firstTreeFile } from '../model/tree.ts';
import { noteDone, request, tracked } from './status.ts';
import { withTab } from './tabs.ts';

export async function switchTheme(theme: string): Promise<boolean> {
  let switched = false;
  await tracked({ id: 'theme', label: 'Applying ' + theme + '…', failed: "Couldn't switch to " + theme }, async () => {
    const response = await request('/api/tokens?theme=' + encodeURIComponent(theme));
    const entry: TokensResponse = await response.json();
    // The code is drawn from the tokens' text, so tokens of another analysis (a refresh in another
    // tab, a restarted server) would show its code under this page's files. Take that analysis
    // whole instead, in the new theme.
    if (entry.analysis !== getState().data.analysis) {
      switched = getState().data.canRefresh && (await refresh(theme));
      return;
    }
    update((state) => ({
      data: {
        ...state.data,
        theme: entry.theme,
        fg: entry.fg,
        bg: entry.bg,
        accent: entry.accent,
        // a theme from the saved choice that isn't in the menu yet joins it
        themes: state.data.themes.some((swatch) => swatch.name === entry.theme)
          ? state.data.themes
          : [...state.data.themes, { name: entry.theme, bg: entry.bg, fg: entry.fg, accent: entry.accent }],
        files: state.data.files.map((file, fileIndex) => ({ ...file, tokens: entry.tokens[fileIndex] })),
      },
    }));
    switched = true;
  });
  return switched;
}

/** Keeps the reader's theme for the next launch, where the server reads it: the page arrives in that theme. */
export function saveTheme(theme: string): void {
  document.cookie = THEME_COOKIE + '=' + encodeURIComponent(theme) + '; path=/; max-age=31536000; samesite=lax';
}

/** What each path of the analysis holds, as a key that changes with it: a refresh's "3 files changed". */
function contentKeys(data: ViewerPayload): Map<string, string> {
  const keys = new Map(data.files.map((file) => [file.file, fileViewKey(file)]));
  for (const path of data.deleted || []) keys.set(path, 'deleted');
  for (const path of data.excluded || []) keys.set(path, 'excluded');
  // a binary's content isn't read: its row says only that it changed, and how
  for (const file of data.binary || []) keys.set(file.file, 'binary ' + file.status);
  for (const rename of data.renamed || []) keys.set(rename.to, 'renamed from ' + rename.from);
  return keys;
}

/** Reanalyzes on the server and takes the result whole; true when it arrived. `theme`: switch to it as well. */
export function refresh(theme = getState().data.theme): Promise<boolean> {
  // PR mode fetches the PR again first
  const label = getState().data.label ? 'Fetching the PR and re-running the analysis…' : 'Re-running the analysis…';
  return tracked({ id: 'refresh', label, failed: 'Refresh failed' }, async () => {
    const response = await request('/api/refresh?theme=' + encodeURIComponent(theme));
    const data: ViewerPayload = await response.json();
    const before = contentKeys(getState().data);
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
        expandedGaps: new Set(), // keyed by line numbers, which an edit moves
        foldOverrides: new Map(),
        // the summary went away (e.g. a refresh in path mode): back to the code
        view: data.summary ? state.view : 'code',
        summaryDot: false, // the analysis came with the newest summary: none waits
        changedOnDisk: false, // and with the code as it is now
      };
    });
    noteDone('Refreshed', changeNote(before, contentKeys(data)));
  });
}

export async function endSession(): Promise<void> {
  try {
    await fetch('/api/shutdown', { method: 'POST' });
  } catch {
    /* the server may drop the connection while dying — that's success */
  }
  update({ ended: true });
}
