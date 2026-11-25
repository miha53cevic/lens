import type { CSSProperties } from 'react';
import { Brand } from './Brand.tsx';
import { Skeleton } from './Skeleton.tsx';
import { TopBar } from './TopBar.tsx';

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

// where an icon button will be
const ICON_SLOT = 'grid size-control flex-none place-items-center';

/**
 * A review on its way, in the viewer's shape: its bar, its sidebar, the open file's card. What
 * is known is real (the name); what the analysis decides (the files, the code) is a placeholder,
 * in the boxes the viewer will fill, so little moves when it does.
 */
export function ReviewSkeleton() {
  return (
    <div className='flex min-h-0 flex-1 flex-col overflow-hidden bg-bg' data-part='review-skeleton'>
      <TopBar>
        <span className={ICON_SLOT}>
          <Skeleton size='icon' />
        </span>
        <Brand />
        <span className='flex-1' />
        <Skeleton size='lg' round width='168px' />
        <span className='flex-1' />
        {ICONS.map((icon) => (
          <span key={icon} className={ICON_SLOT}>
            <Skeleton size='icon' />
          </span>
        ))}
      </TopBar>
      <div className='flex min-h-0 flex-1'>
        <div className='flex w-[270px] flex-none flex-col gap-3 overflow-hidden px-3 py-4 text-sm'>
          <div className='flex items-center gap-2 px-2'>
            <Skeleton size='xs' round width='22px' />
            <Skeleton width='14ch' />
          </div>
          <Skeleton size='sm' />
          <div>
            {TREE.map(([depth, length], row) => (
              <div
                key={row}
                className='flex h-control-sm items-center pr-2 pl-[calc(var(--space-2)+var(--depth)*var(--space-3))] font-mono'
                style={{ '--depth': depth } as CSSProperties}
              >
                <Skeleton width={length + 'ch'} />
              </div>
            ))}
          </div>
        </div>
        <div className='flex min-w-0 flex-1 flex-col'>
          <div className='flex flex-none px-6 pt-3 pb-2'>
            <Skeleton size='sm' round width='132px' />
          </div>
          <div className='flex min-h-0 flex-1 px-6 pb-4'>
            <div className='flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-1'>
              <div className='flex flex-none items-center gap-2 border-b border-line px-4 pt-3 pb-2 font-mono text-sm/[1.5]'>
                <Skeleton width='30ch' />
                <Skeleton width='5ch' />
                <span className='flex-1' />
                <Skeleton size='xs' round width='64px' />
                <Skeleton size='xs' round width='80px' />
              </div>
              <div className='min-h-0 flex-1 overflow-hidden pt-1 pb-3 font-code text-code/[1.75]'>
                {CODE_ROWS.map(([indent, length], row) => (
                  <div
                    key={row}
                    className='flex h-[1.75em] items-center gap-4 pr-5 pl-4'
                    style={{ '--indent': indent } as CSSProperties}
                  >
                    <span className='flex w-[3.2ch] flex-none justify-end'>
                      <Skeleton width='2ch' />
                    </span>
                    {length > 0 && <Skeleton className='ml-[calc(var(--indent)*1ch)]' width={length + 'ch'} />}
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
