// The previews and sequences a page shows: all of them on the overview, a unit's own on its page.

import type { PreviewView, SequenceView, SummaryView } from '../../cli-app/summary/view.ts';
import { memo } from '../shared.ts';

export interface Drawings {
  previews: PreviewView[];
  sequences: SequenceView[];
}

const NONE: Drawings = { previews: [], sequences: [] };

/** The drawings that show this unit; every drawing for the overview (unitId null). */
export const drawingsFor = memo((summary: SummaryView | null, on: boolean, unitId: string | null): Drawings => {
  if (!summary || !on) return NONE;
  if (unitId === null) return { previews: summary.previews, sequences: summary.sequences };
  return {
    previews: summary.previews.filter((preview) => preview.units.includes(unitId)),
    sequences: summary.sequences.filter((sequence) => sequence.units.includes(unitId)),
  };
});

/** The units some drawing shows: the summary list marks them. */
export const drawnUnits = memo((summary: SummaryView | null, on: boolean): Set<string> => {
  if (!summary || !on) return new Set();
  return new Set([...summary.previews, ...summary.sequences].flatMap((drawing) => drawing.units));
});
