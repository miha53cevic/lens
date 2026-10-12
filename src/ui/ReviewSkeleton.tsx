import type { CSSProperties } from 'react';
import { Brand } from './Brand.tsx';
import { Skeleton } from './Skeleton.tsx';
import { TopBar } from './TopBar.tsx';
import './ReviewSkeleton.css';

/** The sidebar's rows: how deep each sits, and its name's length in characters. */
const TREE = [
  [0, 11],
  [1, 19],
  [2, 12],
  [2, 13],
  [2, 15],
  [1, 4],
  [2, 6],
  [2, 9],
  [1, 6],
  [2, 6],
  [0, 4],
  [1, 15],
  [1, 21],
];

/** A stretch of code: each line's indent and length in characters, nothing for an empty line. */
const CODE = [
  [0, 46],
  [0, 39],
  [0, 31],
  [0, 0],
  [0, 51],
  [0, 29],
  [2, 53],
  [2, 44],
  [2, 8],
  [4, 58],
  [6, 34],
  [6, 41],
  [4, 9],
  [2, 2],
  [0, 1],
  [0, 0],
];
const CODE_ROWS = Array.from({ length: 48 }, (_, row) => CODE[row % CODE.length]);

const ICONS = [0, 1, 2];

/**
 * A review on its way, in the viewer's shape: its bar, its sidebar, the open file's card. What
 * is known is real (the name); what the analysis decides (the files, the code) is a placeholder,
 * in the boxes the viewer will fill, so little moves when it does.
 */
export function ReviewSkeleton() {
  return (
    <div className='review-skeleton'>
      <TopBar>
        <span className='review-skeleton-icon'>
          <Skeleton size='icon' />
        </span>
        <Brand />
        <span className='spacer' />
        <Skeleton size='lg' round width='168px' />
        <span className='spacer' />
        {ICONS.map((icon) => (
          <span key={icon} className='review-skeleton-icon'>
            <Skeleton size='icon' />
          </span>
        ))}
      </TopBar>
      <div className='review-skeleton-body'>
        <div className='review-skeleton-nav'>
          <div className='review-skeleton-progress'>
            <Skeleton size='xs' round width='22px' />
            <Skeleton width='14ch' />
          </div>
          <Skeleton size='sm' />
          <div className='review-skeleton-tree'>
            {TREE.map(([depth, length], row) => (
              <div key={row} className='review-skeleton-file' style={{ '--depth': depth } as CSSProperties}>
                <Skeleton width={length + 'ch'} />
              </div>
            ))}
          </div>
        </div>
        <div className='review-skeleton-editor'>
          <div className='review-skeleton-tabs'>
            <Skeleton size='sm' round width='132px' />
          </div>
          <div className='review-skeleton-pane'>
            <div className='review-skeleton-card'>
              <div className='review-skeleton-head'>
                <Skeleton width='30ch' />
                <Skeleton width='5ch' />
                <span className='spacer' />
                <Skeleton size='xs' round width='64px' />
                <Skeleton size='xs' round width='80px' />
              </div>
              <div className='review-skeleton-code'>
                {CODE_ROWS.map(([indent, length], row) => (
                  <div key={row} className='review-skeleton-row' style={{ '--indent': indent } as CSSProperties}>
                    <span className='review-skeleton-num'>
                      <Skeleton width='2ch' />
                    </span>
                    {length > 0 && <Skeleton className='review-skeleton-line' width={length + 'ch'} />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
