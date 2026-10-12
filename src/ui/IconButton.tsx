import type { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';
import { Tip } from './Tip.tsx';
import './IconButton.css';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** What it does: its accessible name, and its tooltip when it has a key */
  label: string;
  /** Its key. A button with one gets a tooltip that teaches it; one without needs none. */
  shortcut?: string;
  /** Which edge the tooltip lines up with */
  tipSide?: 'start' | 'end';
  /** md: a control of its own · sm: inside another control (a tab's close, a field's clear) */
  size?: 'md' | 'sm';
}

/** A button that is only an icon. With a key, a tooltip says what it does and its key. */
export function IconButton({ label, shortcut, tipSide, size = 'md', className, children, ...props }: IconButtonProps) {
  return (
    <button {...props} className={clsx('icon-btn', size === 'sm' && 'icon-btn-sm', className)} aria-label={label}>
      {children}
      {shortcut && <Tip label={label} shortcut={shortcut} side={tipSide} />}
    </button>
  );
}
