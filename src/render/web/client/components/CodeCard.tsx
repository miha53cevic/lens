import type { ReactNode } from 'react';
import clsx from 'clsx';
import './CodeCard.css';

interface CodeCardProps {
  /** The file's or the unit's status: the header's top edge takes its color */
  status?: string;
  head: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Code on the page: a card with a header (status, path, fold chips). The Code view's file and a summary unit's code. */
export function CodeCard({ status, head, className, children }: CodeCardProps) {
  return (
    <div className={clsx('code-card', className)}>
      <div className={clsx('code-head', status && 'st-' + status)}>{head}</div>
      {children}
    </div>
  );
}
