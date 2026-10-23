import { ChevronRight } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import clsx from 'clsx';
import type { FoldRegion } from '../../../cli-app/model.ts';
import { plural } from '../../../cli-app/text.ts';
import type { OldStretch } from '../../rows.ts';
import { catColor } from '../../shared.ts';
import { useLens } from '../../store.ts';
import { isRegionOpen } from '../../model/plans.ts';
import { toggleRegion } from '../../actions/folds.ts';
import { EmptyHalf } from './Rows.tsx';
import type { RowContext } from './types.ts';

interface RegionProps {
  region: FoldRegion;
  /** The labels of the rows inside ("N12", "O5"): a note on one keeps the fold open */
  labels: string[];
  context: RowContext;
  /** Side by side: the old lines it hides (pairRows), for its row's left half */
  split?: { old: OldStretch | null };
  /** Its rows, unified or side by side */
  children: ReactNode;
}

/** A fold: its pill, and its lines underneath (shown when it's open, or pinned by the fold level). */
export function Region({ region, labels, context, split, children }: RegionProps) {
  const { path, changedLines, gutter, marks } = context;
  const { open, pinned } = useLens((state) => ({
    open: isRegionOpen(state, path, region),
    pinned: region.score > state.threshold,
  }));
  let touchesChange = false;
  for (let line = region.startLine; line <= region.endLine; line++) if (changedLines.has(line)) touchesChange = true;
  const notes = marks?.notes;
  const hasNote = !!notes && labels.some((label) => notes.has(label));

  const head = (
    <>
      <span className='num'>{String(region.startLine).padStart(gutter)}</span>
      {/* the changed-lines gutter bar shows on the pill too, so collapsed changes stay scannable in the margin */}
      <span className={clsx('mark', touchesChange && 'changed')} />
    </>
  );
  const pill = (
    <span className='pill' style={{ '--cat': catColor(region.category) } as CSSProperties}>
      <ChevronRight className='caret' size={12} strokeWidth={2.5} />
      <span className='cat eyebrow sm'>{region.category}</span>
      {region.summary}
    </span>
  );

  return (
    <div
      className={clsx('region', open && 'open', pinned && 'pinned', hasNote && 'has-note')}
      data-cat={region.category}
      data-score={region.score}
    >
      {split ? (
        // side by side: the pill on the new side, over the code it quotes (the right half first, as
        // in every split row); the old side says which of its lines are folded with it
        <div className='srow pill-row' onClick={() => toggleRegion(path, region)}>
          <div className='row half right'>
            {head}
            <span>{pill}</span>
          </div>
          {split.old ? (
            <div className='row half left'>
              <span className='num'>{String(split.old.start).padStart(gutter)}</span>
              <span className={clsx('mark', split.old.removed > 0 && 'del')} />
              <span className='fold-old'>
                {plural(split.old.end - split.old.start + 1, 'line') + ' folded'}
                {split.old.removed > 0 && (
                  <>
                    {' · '}
                    <span className='fold-removed'>−{split.old.removed} removed</span>
                  </>
                )}
              </span>
            </div>
          ) : (
            // every line of it is new: the old side has nothing here
            <EmptyHalf side='left' gutter={gutter} />
          )}
        </div>
      ) : (
        <div className='row pill-row' onClick={() => toggleRegion(path, region)}>
          {head}
          {pill}
        </div>
      )}
      <div className='body'>{children}</div>
    </div>
  );
}
