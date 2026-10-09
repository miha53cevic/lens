import type { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';
import { Kbd } from './Kbd.tsx';
import './IconButton.css';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** What it does: its accessible name, and its tooltip when it has a key */
  label: string;
  /** Its key. A button with one gets a tooltip that teaches it; one without needs none. */
  shortcut?: string;
}

/** A button that is only an icon. With a key, a tooltip says what it does and its key. */
export function IconButton({ label, shortcut, className, children, ...props }: IconButtonProps) {
  return (
    <button {...props} className={clsx('icon-btn', className)} aria-label={label}>
      {children}
      {shortcut && (
        <span className='tip' aria-hidden>
          {label} <Kbd combo={shortcut} />
        </span>
      )}
    </button>
  );
}
