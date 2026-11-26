import type { ReactNode } from 'react';

const RADIUS = 17;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface ProgressRingProps {
  done: number;
  total: number;
  /** What is counted: "files viewed" */
  label: string;
  /** A line under the label */
  children?: ReactNode;
}

/** How far the review got: a ring and "3 of 7". */
export function ProgressRing({ done, total, label, children }: ProgressRingProps) {
  const filled = total > 0 ? (CIRCUMFERENCE * done) / total : 0;
  return (
    <div className='flex items-center gap-3 px-2 pt-1 pb-3'>
      <svg className='size-[40px] flex-none -rotate-90' viewBox='0 0 42 42' aria-hidden>
        <circle className='fill-none stroke-line-strong stroke-4' cx='21' cy='21' r={RADIUS} />
        <circle
          className='fill-none stroke-add stroke-4 [stroke-linecap:round] [transition:stroke-dasharray_var(--motion-slow)]'
          cx='21'
          cy='21'
          r={RADIUS}
          strokeDasharray={filled + ' ' + CIRCUMFERENCE}
        />
      </svg>
      <div data-part='progress' className='flex min-w-0 flex-col text-sm leading-[1.35] text-muted'>
        <b data-part='progress-count' className='text-lg text-text'>
          {done} of {total}
        </b>
        <span>{label}</span>
        {children}
      </div>
    </div>
  );
}
