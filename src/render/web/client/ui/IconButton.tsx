import type { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';
import './IconButton.css';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** What it does: its tooltip and its accessible name */
  label: string;
  /** Its key, shown in the tooltip */
  shortcut?: string;
  /** The tooltip opens above it (for buttons at the bottom of the window) */
  tipAbove?: boolean;
}

/** A button that is only an icon. Its tooltip says what it does, and its key. */
export function IconButton({ label, shortcut, tipAbove, className, children, ...props }: IconButtonProps) {
  return (
    <button
      {...props}
      className={clsx('icon-btn', tipAbove && 'tip-above', className)}
      aria-label={label}
      data-tip={shortcut ? label + '  ' + shortcut : label}
    >
      {children}
    </button>
  );
}
