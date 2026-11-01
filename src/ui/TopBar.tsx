import type { ReactNode } from 'react';
import { cn } from './cn.ts';

/** The bar along the top of a page: the viewer's header, the picker's. */
export function TopBar({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <header
      data-part='header'
      className={cn('flex h-[52px] flex-none items-center gap-2 border-b border-line bg-bg px-3', className)}
    >
      {children}
    </header>
  );
}

/** A hairline between two groups of the bar's controls. */
export function TopBarDivider() {
  return <span className='mx-1 h-5 w-px flex-none bg-line' />;
}
