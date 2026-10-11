import { useMemo, type CSSProperties, type MouseEvent } from 'react';
import clsx from 'clsx';
import type { FoldRegion } from '../../cli-app/model.ts';
import type { CodeItem } from '../rows.ts';
import { useLens } from '../store.ts';
import { isRegionOpen } from '../model/plans.ts';
import { rulerTicks, type RegionShows } from '../model/ruler.ts';
import { landOn } from '../actions/views.ts';
import './OverviewRuler.css';

interface OverviewRulerProps {
  /** The file the rows are from: folds open by its path */
  path: string;
  items: CodeItem[];
  changedLines: ReadonlySet<number>;
  /** Open concerns' kinds, by row label ("N12", "O5") */
  flagged: ReadonlyMap<string, string>;
}

/**
 * A strip beside the code, the height of its rows, with a tick where each change, removed
 * stretch and concern sits. A click scrolls to the tick's row, opening its fold.
 */
export function OverviewRuler({ path, items, changedLines, flagged }: OverviewRulerProps) {
  const folds = useLens((state) => ({
    foldOverrides: state.foldOverrides,
    openCats: state.openCats,
    threshold: state.threshold,
  }));
  const ticks = useMemo(() => {
    // as Region shows it: a fold holding a concern's note stays open whatever the fold controls say
    const regionShows = (region: FoldRegion, body: CodeItem[]): RegionShows => {
      if (region.score > folds.threshold) return 'lines';
      const noted = body.some(
        (item) =>
          (item.kind === 'line' && flagged.has('N' + item.line)) ||
          (item.kind === 'removed' && flagged.has('O' + item.old)),
      );
      if (noted) return 'lines';
      return isRegionOpen(folds, path, region) ? 'open' : 'folded';
    };
    return rulerTicks(items, changedLines, flagged, regionShows);
  }, [folds, path, items, changedLines, flagged]);
  if (ticks.length === 0) return null;

  const jump = (event: MouseEvent<HTMLElement>, label: string) => {
    const line = label.slice(1);
    const selector = label.startsWith('N') ? '.row[data-line="' + line + '"]' : '.row[data-old="' + line + '"]';
    const row = event.currentTarget.closest('.code-card')?.querySelector<HTMLElement>(selector);
    if (row) landOn(row, path, label);
  };
  return (
    <div className='ruler' aria-hidden='true'>
      <div className='ruler-track'>
        {ticks.map((tick, tickIndex) => (
          <div
            key={tickIndex}
            className={clsx(
              'tick',
              'tick-' + tick.kind,
              tick.kind !== 'add' && tick.kind !== 'del' && ['concern', 'k-' + tick.kind],
            )}
            data-label={tick.label}
            style={{ top: tick.top * 100 + '%', height: tick.height * 100 + '%' } as CSSProperties}
            onClick={(event) => jump(event, tick.label)}
          />
        ))}
      </div>
    </div>
  );
}
