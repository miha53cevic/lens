import { useMemo, type CSSProperties, type MouseEvent, type PointerEvent, type WheelEvent } from 'react';
import clsx from 'clsx';
import type { FoldRegion } from '../../cli-app/model.ts';
import type { CodeItem } from '../rows.ts';
import { useLens } from '../store.ts';
import { isRegionOpen, isSplit } from '../model/plans.ts';
import { rulerTicks, type RegionShows } from '../model/ruler.ts';
import { landOn } from '../actions/views.ts';

interface OverviewRulerProps {
  /** The file the rows are from: folds open by its path */
  path: string;
  items: CodeItem[];
  changedLines: ReadonlySet<number>;
  /** Open concerns' kinds, by row label ("N12", "O5") */
  flagged: ReadonlyMap<string, string>;
  /** The code's scrollbar too (the Code tab's): a thumb over what's in sight, dragged or clicked to move it */
  thumb?: boolean;
}

/**
 * A strip beside the code, the height of its rows, with a tick where each change, removed
 * stretch and concern sits. A click scrolls to the tick's row, opening its fold. Side by side has
 * none: its rows pair the old side with the new, so the ticks wouldn't sit on theirs. As the Code
 * tab's scrollbar it shows with no ticks too.
 */
export function OverviewRuler({ path, items, changedLines, flagged, thumb }: OverviewRulerProps) {
  const folds = useLens((state) => ({
    foldOverrides: state.foldOverrides,
    openCats: state.openCats,
    threshold: state.threshold,
  }));
  const split = useLens((state) => isSplit(state));
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
  if (split || (ticks.length === 0 && !thumb)) return null;

  const jump = (event: MouseEvent<HTMLElement>, label: string) => {
    const line = label.slice(1);
    const selector = label.startsWith('N') ? '.row[data-line="' + line + '"]' : '.row[data-old="' + line + '"]';
    const row = event.currentTarget.closest('[data-part="code-card"]')?.querySelector<HTMLElement>(selector);
    if (row) landOn(row, path, label);
  };
  return (
    <div
      data-part='ruler'
      className={clsx(
        'flex-none border-l border-line bg-[color-mix(in_oklab,var(--surface-2)_60%,transparent)] pt-1 pb-3',
        thumb ? 'w-[14px]' : 'w-[10px]',
      )}
      aria-hidden='true'
      onWheel={thumb ? scrollCode : undefined}
    >
      <div
        className='relative h-full'
        onPointerDown={thumb ? grabThumb : undefined}
        onPointerMove={thumb ? dragThumb : undefined}
      >
        {thumb && (
          <div
            data-part='ruler-thumb'
            className='pointer-events-none absolute inset-x-0 top-[calc(var(--view-top,0)*100%)] h-[calc(var(--view-h,1)*100%)] bg-[color-mix(in_oklab,var(--code-fg)_10%,transparent)]'
          />
        )}
        {ticks.map((tick, tickIndex) => (
          <div
            key={tickIndex}
            data-part='tick'
            data-kind={tick.kind}
            className={clsx(
              'absolute cursor-pointer rounded-xs hover:shadow-[0_0_0_1px_var(--text)]',
              tick.kind === 'add' || tick.kind === 'del'
                ? [
                    'right-[2px] left-[2px] min-h-[3px] opacity-85 hover:opacity-100',
                    tick.kind === 'add' ? 'bg-add' : 'bg-del',
                  ]
                : // a concern: its signal color, wider than the changes under it
                  ['right-0 left-0 min-h-[4px] bg-(--k)', 'k-' + tick.kind],
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

const codeBody = (ruler: Element) =>
  ruler.closest('[data-part="code-card"]')?.querySelector<HTMLElement>('[data-part="code-body"]');

/** The code scrolled so the point of the track under the pointer is the middle of what's in sight. */
function scrollTo(track: HTMLElement, clientY: number) {
  const body = codeBody(track);
  if (!body) return;
  // a fraction of the track: the page's zoom is on both sides of it
  const box = track.getBoundingClientRect();
  const at = Math.min(1, Math.max(0, (clientY - box.top) / (box.height || 1)));
  body.scrollTop = at * body.scrollHeight - body.clientHeight / 2;
}

function grabThumb(event: PointerEvent<HTMLDivElement>) {
  // a tick is a jump of its own
  if (event.button !== 0 || (event.target as Element).closest('[data-part="tick"]')) return;
  event.preventDefault();
  event.currentTarget.setPointerCapture?.(event.pointerId);
  scrollTo(event.currentTarget, event.clientY);
}

function dragThumb(event: PointerEvent<HTMLDivElement>) {
  if (event.currentTarget.hasPointerCapture?.(event.pointerId)) scrollTo(event.currentTarget, event.clientY);
}

/** The wheel over the ruler turns the code, as it would over a scrollbar. */
function scrollCode(event: WheelEvent<HTMLDivElement>) {
  const body = codeBody(event.currentTarget);
  if (body) body.scrollTop += event.deltaY;
}
