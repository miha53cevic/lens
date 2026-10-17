// Build previews: the reader's switch, and what the preview frames tell the page.

import { getState, update } from '../store.ts';
import { openSummaryUnit } from './summary.ts';
import { noteDone, request, tracked } from './status.ts';

/** How tall a preview's frame may grow to fit its screen */
const FRAME_MIN = 120;
const FRAME_MAX = 900;

/** The switch: summary mode asks the agent for previews and sequences (the CLI reads .lens/settings.json). */
export function setBuildPreviews(on: boolean): Promise<boolean> {
  return tracked(
    { id: 'build-previews', label: 'Saving Build previews…', failed: "Couldn't save Build previews" },
    async () => {
      await request('/api/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ buildPreviews: on }),
      });
      update((state) => ({ data: { ...state.data, buildPreviews: on } }));
      noteDone(
        on ? 'Build previews on' : 'Build previews off',
        on ? 'your agent draws them on its next summary' : undefined,
      );
    },
  );
}

/**
 * A message from a preview's frame (its script is lens's, summary/previews.ts): its height, or a
 * click on a unit's element. Only a preview frame of this page is heard, and only for its own units.
 */
export function onPreviewMessage(event: MessageEvent): void {
  const message = event.data as { lens?: unknown; type?: unknown; height?: unknown; unit?: unknown } | null;
  if (!message || message.lens !== true) return;
  const frame = [...document.querySelectorAll<HTMLIFrameElement>('iframe.preview-frame')].find(
    (candidate) => candidate.contentWindow === event.source,
  );
  if (!frame) return;
  if (message.type === 'size' && typeof message.height === 'number') {
    frame.style.height = Math.round(Math.min(FRAME_MAX, Math.max(FRAME_MIN, message.height))) + 'px';
  } else if (message.type === 'open-unit' && typeof message.unit === 'string') {
    const units = (frame.dataset.units ?? '').split('\n');
    const known = getState().data.summary?.units.some((unit) => unit.id === message.unit);
    if (units.includes(message.unit) && known) openSummaryUnit(message.unit);
  }
}
