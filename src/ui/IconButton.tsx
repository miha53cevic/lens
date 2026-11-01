import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn.ts';
import { Tip } from './Tip.tsx';

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
    <button
      data-part='icon-btn'
      {...props}
      data-size={size}
      className={cn(
        'relative inline-grid size-control flex-none place-items-center rounded-full text-muted motion-colors not-disabled:hover:bg-hover-bg not-disabled:hover:text-text aria-pressed:bg-selected-bg aria-pressed:text-accent aria-pressed:shadow-[inset_0_0_0_1px_var(--selected-ring)]',
        size === 'sm' && 'size-control-xs',
        className,
      )}
      aria-label={label}
    >
      {children}
      {shortcut && <Tip label={label} shortcut={shortcut} side={tipSide} />}
    </button>
  );
}
