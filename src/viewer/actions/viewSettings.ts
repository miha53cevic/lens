// How the reader leaves the viewer (Settings' view settings, the panels) is kept by the server, the
// same in every repository (~/.lens/settings.json), as the marks are for a review: the state changes first, then
// the one change is posted, and a failure says so in the status bar. The browser keeps none of it.

import type { ViewSettings } from '../../cli-app/api/contract.ts';
import { api, tracked } from './status.ts';

/** Settings' footer: the server shows the settings file in Finder or Explorer. */
export function revealSettingsFile(): Promise<boolean> {
  return tracked(
    { id: 'reveal-settings', label: 'Showing the settings file…', failed: "Couldn't show the settings file" },
    async () => {
      await api('POST /api/settings/reveal');
    },
  );
}

/** The Config page's footer: the server shows the .lens.json in effect in Finder or Explorer. */
export function revealConfigFile(): Promise<boolean> {
  return tracked(
    { id: 'reveal-config', label: 'Showing .lens.json…', failed: "Couldn't show .lens.json" },
    async () => {
      await api('POST /api/config/reveal');
    },
  );
}

export function saveView(change: ViewSettings): Promise<boolean> {
  return tracked({ id: 'view', label: 'Saving the view…', failed: "Couldn't save the view setting" }, async () => {
    await api('POST /api/view', { body: change });
  });
}
