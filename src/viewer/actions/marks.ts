// The reader's marks (viewed files and changes, verdicts on findings) are kept by the server, per
// review (.lens/marks/<review>.json). The state changes first, so a tick is never slowed; then the
// one change is posted, and a failure says so in the status bar.

import type { MarkChange } from '../../cli-app/marks/store.ts';
import { api, tracked } from './status.ts';

export function saveMark(change: MarkChange): Promise<boolean> {
  return tracked({ id: 'mark', label: 'Saving the mark…', failed: "Couldn't save the mark" }, async () => {
    await api('POST /api/marks', { body: change });
  });
}

/** Where marks were kept before the server kept them: left by an older lens, never read again. */
const OLD_MARK_PREFS = ['lens.viewedFiles', 'lens.viewedUnits', 'lens.concernMarks'];

export function forgetOldMarks(): void {
  try {
    for (const key of OLD_MARK_PREFS) localStorage.removeItem(key);
  } catch {}
}
