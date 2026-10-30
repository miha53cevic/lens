// Clear saved data: the ⋯ menu's dialog. The server's kinds (src/cli-app/clear.ts) are what
// lens keeps on disk; the kinds below are what this browser keeps. The dialog lists both, so
// a new kind is one more entry in one of the two lists.

import type { ClearRequest } from '../../cli-app/api/contract.ts';
import type { ClearScope } from '../../cli-app/clear.ts';
import { commit, getState, type LensState, update } from '../store.ts';
import { countText } from '../../cli-app/text.ts';
import { dialog } from './dialogs.ts';
import { api, noteDone, tracked } from './status.ts';

/** Something this browser keeps that the reader can clear */
export interface ViewerKind {
  id: string;
  label: string;
  /** Where it is, said in the dialog after its count */
  where: string;
  unit: [string, string];
  count: (state: LensState) => number;
  clear: () => void;
}

/** None today: the marks were one, until the server kept them (src/cli-app/clear.ts) */
export const VIEWER_KINDS: ViewerKind[] = [];

/** What the reader ticked: a server kind with its scope, a viewer kind by its id */
export interface ClearPicks {
  server: Record<string, ClearScope>;
  viewer: string[];
}

/** Reads what each kind holds now, then shows the dialog. */
export async function openClearData(): Promise<void> {
  await tracked(
    { id: 'clear-info', label: 'Reading what lens keeps…', failed: "Couldn't read what lens keeps" },
    async () => {
      const info = await api('GET /api/clear');
      commit({ clearInfo: { ...info, opened: Date.now() } });
      const element = dialog('clear-modal');
      if (element && !element.open) element.showModal();
    },
  );
}

export async function clearData(picks: ClearPicks): Promise<void> {
  const serverIds = Object.keys(picks.server);
  if (serverIds.length === 0 && picks.viewer.length === 0) return;
  await tracked({ id: 'clear', label: 'Clearing…', failed: "Couldn't clear it" }, async () => {
    const said: string[] = [];
    if (serverIds.length > 0) {
      const body: ClearRequest = { picks: picks.server };
      const answer = await api('POST /api/clear', { body });
      update((state) => ({
        summaryDot: false,
        data: answer.summary ? { ...state.data, summary: answer.summary } : state.data,
        // "this review" or "all": either way the open review's are gone
        ...(answer.cleared.notes && { notes: [], noteDraft: null }),
        ...(answer.cleared.marks && { viewedFiles: new Set(), viewedUnits: new Set(), concernMarks: new Map() }),
      }));
      for (const kind of getState().clearInfo?.kinds ?? []) {
        const plan = answer.cleared[kind.id];
        if (plan) said.push(kind.label.toLowerCase() + ' (' + countText(kind.unit, plan.count) + ')');
      }
    }
    for (const kind of VIEWER_KINDS.filter((candidate) => picks.viewer.includes(candidate.id))) {
      said.push(kind.label.toLowerCase() + ' (' + countText(kind.unit, kind.count(getState())) + ')');
      kind.clear();
    }
    dialog('clear-modal')?.close();
    noteDone('Cleared ' + said.join(' and '));
  });
}
