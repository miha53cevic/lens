// The overview ruler beside the code: where the changes, removed lines and concerns sit among
// the rows on screen, as shares of the code's height. Placed by row, not by line number, so
// folds and hidden stretches don't push the ticks off their rows.

import type { FoldRegion } from '../../cli-app/model.ts';
import type { CodeItem } from '../rows.ts';

/** How a fold shows: its pill alone, its pill over its lines, or its lines alone (pinned, or holding a note). */
export type RegionShows = 'folded' | 'open' | 'lines';

export interface RulerTick {
  /** Where it starts and how tall it is, as shares of the rows (0–1) */
  top: number;
  height: number;
  /** 'add', 'del', or a concern's kind ('bug', 'risk', 'question') */
  kind: string;
  /** The row it jumps to: "N12" a line, "O5" a removed line */
  label: string;
}

interface Mark {
  row: number;
  endRow: number;
  kind: string;
  label: string;
}

/**
 * The ticks for a plan's rows: a run of changed (or removed) rows is one tick, and a concern
 * gets its own tick over them. A change inside a folded region ticks at the fold's pill.
 */
export function rulerTicks(
  items: CodeItem[],
  changedLines: ReadonlySet<number>,
  flagged: ReadonlyMap<string, string>,
  regionShows: (region: FoldRegion, body: CodeItem[]) => RegionShows,
): RulerTick[] {
  const marks: Mark[] = [];
  let row = 0;
  // the last tick of each change kind: the next row of the same kind (or the same pill) extends it
  const lastChange = new Map<string, Mark>();
  const mark = (kind: string, label: string, at: number) => {
    const last = lastChange.get(kind);
    if (last && at - last.endRow <= 1) {
      last.endRow = at;
      return;
    }
    const added = { row: at, endRow: at, kind, label };
    marks.push(added);
    if (kind === 'add' || kind === 'del') lastChange.set(kind, added);
  };
  const walk = (body: CodeItem[], pillRow: number | null) => {
    for (const item of body) {
      const at = pillRow ?? row;
      switch (item.kind) {
        case 'line': {
          const label = 'N' + item.line;
          if (changedLines.has(item.line)) mark('add', label, at);
          const concern = flagged.get(label);
          if (concern) mark(concern, label, at);
          break;
        }
        case 'removed': {
          const label = 'O' + item.old;
          mark('del', label, at);
          const concern = flagged.get(label);
          if (concern) mark(concern, label, at);
          break;
        }
        case 'region': {
          const shows = regionShows(item.region, item.body);
          if (pillRow !== null) walk(item.body, pillRow);
          else if (shows === 'folded') {
            walk(item.body, row);
            row++;
          } else {
            if (shows === 'open') row++;
            walk(item.body, null);
          }
          continue;
        }
      }
      if (pillRow === null) row++;
    }
  };
  walk(items, null);
  const total = Math.max(row, 1);
  // the concerns last, so they draw over the changes
  const isChange = (kind: string) => kind === 'add' || kind === 'del';
  return [...marks.filter((each) => isChange(each.kind)), ...marks.filter((each) => !isChange(each.kind))].map(
    (each) => ({
      top: each.row / total,
      height: (each.endRow - each.row + 1) / total,
      kind: each.kind,
      label: each.label,
    }),
  );
}
