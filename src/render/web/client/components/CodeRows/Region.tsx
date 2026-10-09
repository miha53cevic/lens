import { ChevronRight } from 'lucide-react';
import type { CSSProperties } from 'react';
import clsx from 'clsx';
import type { FoldRegion } from '../../../../../model.ts';
import type { CodeItem } from '../../rows.ts';
import { catColor } from '../../shared.ts';
import { useLens } from '../../store.ts';
import { isRegionOpen } from '../../model/plans.ts';
import { toggleRegion } from '../../actions/folds.ts';
import { planRows } from './index.tsx';
import type { RowContext } from './types.ts';

interface RegionProps {
  region: FoldRegion;
  /** The region's lines, with the removed lines anchored inside it */
  body: CodeItem[];
  context: RowContext;
}

/** A fold: its pill, and its lines underneath (shown when it's open, or pinned by the fold level). */
export function Region({ region, body, context }: RegionProps) {
  const { path, changedLines, gutter, marks } = context;
  const { open, pinned } = useLens((state) => ({
    open: isRegionOpen(state, path, region),
    pinned: region.score > state.threshold,
  }));
  let touchesChange = false;
  for (let line = region.startLine; line <= region.endLine; line++) if (changedLines.has(line)) touchesChange = true;
  const notes = marks?.notes;
  const hasNote =
    !!notes &&
    body.some(
      (item) =>
        (item.kind === 'line' && notes.has('N' + item.line)) || (item.kind === 'removed' && notes.has('O' + item.old)),
    );

  return (
    <div
      className={clsx('region', open && 'open', pinned && 'pinned', hasNote && 'has-note')}
      data-cat={region.category}
      data-score={region.score}
    >
      <div className='row pill-row' onClick={() => toggleRegion(path, region)}>
        <span className='num'>{String(region.startLine).padStart(gutter)}</span>
        {/* the changed-lines gutter bar shows on the pill too, so collapsed changes stay scannable in the margin */}
        <span className={clsx('mark', touchesChange && 'changed')} />
        <span className='pill' style={{ '--cat': catColor(region.category) } as CSSProperties}>
          <ChevronRight className='caret' size={12} strokeWidth={2.5} />
          <span className='cat'>{region.category}</span>
          {region.summary}
        </span>
      </div>
      <div className='body'>{planRows(body, context)}</div>
    </div>
  );
}
