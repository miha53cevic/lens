import type { ReactNode } from 'react';
import './ProgressRing.css';

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
    <div className='progress'>
      <svg viewBox='0 0 42 42' aria-hidden>
        <circle className='track' cx='21' cy='21' r={RADIUS} />
        <circle className='fill' cx='21' cy='21' r={RADIUS} strokeDasharray={filled + ' ' + CIRCUMFERENCE} />
      </svg>
      <div className='progress-text'>
        <b className='progress-count'>
          {done} of {total}
        </b>
        <span>{label}</span>
        {children}
      </div>
    </div>
  );
}
