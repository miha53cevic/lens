// The reader's switches (Build previews, Check yourself, Plan tab, the agent), and what the preview frames tell the page.

import { commit, getState, update } from '../store.ts';
import { hideLspHover } from './lsp.ts';
import { setView, stampWatcher } from './views.ts';
import { check } from '../../ui/poll.ts';
import { askWatcher } from '../ask/rail.ts';
import { api, noteDone, tracked } from './status.ts';
import { cssPx } from '../../ui/zoom.ts';
import type { AgentId } from '../../cli-app/agents/types.ts';

/** How tall a preview's frame may grow to fit its screen */
const FRAME_MIN = 120;
const FRAME_MAX = 900;

/** The switch: TypeScript on the code (actions/lsp.ts). Turned off, a card that's open goes. */
export function setTypescriptLsp(on: boolean): Promise<boolean> {
  return tracked(
    { id: 'typescript-lsp', label: 'Saving TypeScript…', failed: "Couldn't save TypeScript" },
    async () => {
      await api('POST /api/settings', { body: { typescriptLsp: on } });
      if (!on) hideLspHover();
      update((state) => ({ data: { ...state.data, typescriptLsp: on }, lspStatus: on ? state.lspStatus : null }));
      // the server starts on the stamp's ask: the bar says so now, not at the next poll
      if (on) void check(stampWatcher.id);
      noteDone(on ? 'TypeScript on' : 'TypeScript off', on ? 'hover a name, or ⌘-click it' : undefined);
    },
  );
}

/** The switch: summary mode asks the agent for previews and sequences (the CLI reads ~/.lens/settings.json). */
export function setBuildPreviews(on: boolean): Promise<boolean> {
  return tracked(
    { id: 'build-previews', label: 'Saving Build previews…', failed: "Couldn't save Build previews" },
    async () => {
      await api('POST /api/settings', { body: { buildPreviews: on } });
      update((state) => ({ data: { ...state.data, buildPreviews: on } }));
      noteDone(
        on ? 'Build previews on' : 'Build previews off',
        on ? 'your agent draws them on its next summary' : undefined,
      );
    },
  );
}

/** The switch: the viewer shows the Plan tab. Turned off while it's open, the page goes back to the code. */
export function setPlanTab(on: boolean): Promise<boolean> {
  return tracked({ id: 'plan-tab', label: 'Saving Plan tab…', failed: "Couldn't save Plan tab" }, async () => {
    await api('POST /api/settings', { body: { planTab: on } });
    if (!on && getState().view === 'plan') setView('code');
    update((state) => ({ data: { ...state.data, planTab: on } }));
    noteDone(on ? 'Plan tab on' : 'Plan tab off');
  });
}

/** The agent lens runs itself to write the summary and answer Ask questions; null: the reader's own, through the skills. */
export function setAgent(agent: AgentId | null): Promise<boolean> {
  return tracked({ id: 'agent', label: 'Saving the agent…', failed: "Couldn't save the agent" }, async () => {
    await api('POST /api/settings', { body: { agent } });
    update((state) => ({ data: { ...state.data, agent } }));
    // the summary's run and the rail's agent follow the pick: the bar and the rail say so now
    void check(stampWatcher.id);
    void check(askWatcher.id);
    noteDone('Agent saved');
  });
}

/** The switch: summary mode asks the agent for questions to check your understanding with. */
export function setSelfChecks(on: boolean): Promise<boolean> {
  return tracked(
    { id: 'self-checks', label: 'Saving Check yourself…', failed: "Couldn't save Check yourself" },
    async () => {
      await api('POST /api/settings', { body: { selfChecks: on } });
      update((state) => ({ data: { ...state.data, selfChecks: on } }));
      noteDone(
        on ? 'Check yourself on' : 'Check yourself off',
        on ? 'your agent writes them on its next summary' : undefined,
      );
    },
  );
}

/**
 * A message from a preview's frame (its script is lens's, summary/previews.ts): its height. Only a
 * preview frame of this page is heard.
 */
export function onPreviewMessage(event: MessageEvent): void {
  const message = event.data as { lens?: unknown; type?: unknown; height?: unknown } | null;
  if (!message || message.lens !== true) return;
  const frame = [...document.querySelectorAll<HTMLIFrameElement>('iframe')].find(
    (candidate) => candidate.contentWindow === event.source,
  );
  // a frame that fills (an expanded preview's) keeps its dialog's height
  if (!frame || frame.dataset.fill !== undefined) return;
  if (message.type === 'size' && typeof message.height === 'number') {
    frame.style.height = Math.round(Math.min(FRAME_MAX, Math.max(FRAME_MIN, message.height))) + 'px';
  }
}

const previewCards = () => [...document.querySelectorAll<HTMLElement>('#summary-pane [data-part="preview-card"]')];
const cardFrame = (card: HTMLElement) => card.querySelector<HTMLIFrameElement>('iframe');

/**
 * A preview's unit chip on a unit's page: opens that unit with the preview where it was on screen.
 * The new page starts at the top, so it scrolls back to put the card in its place, and its frames
 * take the heights the old ones had, since a fresh frame is short until its screen says how tall.
 */
export function openUnitFromPreview(unitId: string, title: string): void {
  const card = previewCards().find((candidate) => candidate.dataset.preview === title);
  const offset = card ? card.getBoundingClientRect().top : null;
  const heights = new Map(
    previewCards().map((candidate) => [candidate.dataset.preview, cardFrame(candidate)?.style.height]),
  );
  commit({ summaryUnit: unitId });
  for (const candidate of previewCards()) {
    const frame = cardFrame(candidate);
    const height = heights.get(candidate.dataset.preview);
    if (frame && height) frame.style.height = height;
  }
  const pane = document.getElementById('summary-pane');
  const moved = previewCards().find((candidate) => candidate.dataset.preview === title);
  if (pane && moved && offset !== null) pane.scrollTop += cssPx(moved.getBoundingClientRect().top - offset);
}
