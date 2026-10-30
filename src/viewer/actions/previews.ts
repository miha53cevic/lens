// Build previews: the reader's switch, and what the preview frames tell the page.

import { commit, update } from '../store.ts';
import { api, noteDone, tracked } from './status.ts';

/** How tall a preview's frame may grow to fit its screen */
const FRAME_MIN = 120;
const FRAME_MAX = 900;

/** The switch: summary mode asks the agent for previews and sequences (the CLI reads .lens/settings.json). */
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

/**
 * A message from a preview's frame (its script is lens's, summary/previews.ts): its height. Only a
 * preview frame of this page is heard.
 */
export function onPreviewMessage(event: MessageEvent): void {
  const message = event.data as { lens?: unknown; type?: unknown; height?: unknown } | null;
  if (!message || message.lens !== true) return;
  const frame = [...document.querySelectorAll<HTMLIFrameElement>('iframe.preview-frame')].find(
    (candidate) => candidate.contentWindow === event.source,
  );
  if (!frame) return;
  if (message.type === 'size' && typeof message.height === 'number') {
    frame.style.height = Math.round(Math.min(FRAME_MAX, Math.max(FRAME_MIN, message.height))) + 'px';
  }
}

const previewCards = () => [...document.querySelectorAll<HTMLElement>('#summary-pane .preview-card')];
const cardFrame = (card: HTMLElement) => card.querySelector<HTMLIFrameElement>('iframe.preview-frame');

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
  if (pane && moved && offset !== null) pane.scrollTop += moved.getBoundingClientRect().top - offset;
}
