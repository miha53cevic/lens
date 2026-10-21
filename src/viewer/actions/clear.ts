// Clear saved data: the ⋯ menu's dialog. The server's kinds (src/cli-app/clear.ts) are what
// lens keeps on disk; the kinds below are what this browser keeps. The dialog lists both, so
// a new kind is one more entry in one of the two lists.

import type { ClearInfoResponse, ClearRequest, ClearResponse } from '../../cli-app/render/web/server.ts';
import type { ClearScope } from '../../cli-app/clear.ts';
import { commit, CONCERN_PREF, getState, type LensState, update, VIEWED_PREF } from '../store.ts';
import { writePref } from '../shared.ts';
import { dialog } from './dialogs.ts';
import { noteDone, request, tracked } from './status.ts';

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

export const VIEWER_KINDS: ViewerKind[] = [
  {
    id: 'marks',
    label: 'Viewed and concern marks',
    where: 'in this browser',
    unit: ['mark', 'marks'],
    count: (state) => state.viewedFiles.size + state.viewedUnits.size + state.concernMarks.size,
    clear: () => {
      writePref(VIEWED_PREF.files, '[]');
      writePref(VIEWED_PREF.units, '[]');
      writePref(CONCERN_PREF, '{}');
      update({ viewedFiles: new Set(), viewedUnits: new Set(), concernMarks: new Map() });
    },
  },
];

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
      const info: ClearInfoResponse = await (await request('/api/clear')).json();
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
      const response = await request('/api/clear', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const answer: ClearResponse = await response.json();
      update((state) => ({
        summaryDot: false,
        data: answer.summary ? { ...state.data, summary: answer.summary } : state.data,
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

export function countText(unit: [string, string], count: number): string {
  return count + ' ' + unit[count === 1 ? 0 : 1];
}
