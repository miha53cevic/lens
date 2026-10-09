import { Info as InfoIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface InfoProps {
  title: string;
  children: ReactNode;
  note?: string;
}

/** ⓘ with a hover tip, the same widget as the fold-level help in the toolbar. */
export function Info({ title, children, note }: InfoProps) {
  return (
    <span className='info' aria-label={title}>
      <InfoIcon size={12} />
      <span className='tip'>
        <div className='tip-title'>{title}</div>
        {children}
        {note && <div className='tip-note'>{note}</div>}
      </span>
    </span>
  );
}
