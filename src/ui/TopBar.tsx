import type { ReactNode } from 'react';
import clsx from 'clsx';
import './TopBar.css';

/** The bar along the top of a page: the viewer's header, the picker's. */
export function TopBar({ className, children }: { className?: string; children: ReactNode }) {
  return <header className={clsx('header', className)}>{children}</header>;
}

/** A hairline between two groups of the bar's controls. */
export function TopBarDivider() {
  return <span className='header-divider' />;
}
