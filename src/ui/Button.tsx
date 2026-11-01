import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn.ts';
import { Tip } from './Tip.tsx';

const BUTTON =
  'relative inline-flex flex-none items-center gap-2 rounded-full border text-sm font-medium whitespace-nowrap motion-colors';

const VARIANTS = {
  // the hover tint over the button's own surface, so it stays opaque; on (a verdict given): the selected look
  default:
    'border-line-strong bg-surface text-text not-disabled:hover:bg-[linear-gradient(var(--hover-bg),var(--hover-bg)),var(--surface)] aria-pressed:border-selected-ring aria-pressed:bg-selected-bg',
  // a ghost button has no box to show on in
  ghost: 'border-transparent bg-transparent text-muted not-disabled:hover:bg-hover-bg not-disabled:hover:text-text',
  // a key on it: its own colors would vanish into the accent
  primary:
    'border-transparent bg-accent font-semibold text-accent-fg not-disabled:hover:bg-[color-mix(in_oklab,var(--accent)_88%,var(--text))] aria-pressed:border-selected-ring aria-pressed:bg-selected-bg [&_kbd]:border-[color-mix(in_oklab,var(--accent-fg)_var(--tint-line),transparent)] [&_kbd]:bg-transparent [&_kbd]:text-accent-fg [&_kbd]:shadow-none',
  // what deletes something, once the reader has seen what goes: the danger color, solid
  danger:
    'border-transparent bg-danger font-semibold text-surface not-disabled:hover:bg-[color-mix(in_oklab,var(--danger)_88%,var(--text))] aria-pressed:border-selected-ring aria-pressed:bg-selected-bg',
};

const SIZES = {
  md: 'h-control px-3',
  sm: 'h-control-sm px-3',
  xs: 'h-control-xs px-2 text-xs',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** default: outlined · ghost: no border, a tint under the pointer · primary: the accent · danger: deletes something */
  variant?: 'default' | 'ghost' | 'primary' | 'danger';
  /** md: the usual · sm: a smaller one · xs: a chip's height, inside a card's row (a note's actions, a verdict) */
  size?: 'md' | 'sm' | 'xs';
  /** Its key: the button gets a tooltip that teaches it */
  shortcut?: string;
  /** What the tooltip says before the key, when the label alone doesn't */
  tip?: string;
  /** Which edge the tooltip lines up with */
  tipSide?: 'start' | 'end';
}

/** A button with a label (and maybe an icon before it). Icon-only buttons are IconButton. */
export function Button({
  variant = 'default',
  size = 'md',
  shortcut,
  tip,
  tipSide,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      data-part='btn'
      {...props}
      data-variant={variant}
      data-size={size}
      className={cn(BUTTON, VARIANTS[variant], SIZES[size], className)}
    >
      {children}
      {shortcut && <Tip label={tip} shortcut={shortcut} side={tipSide} />}
    </button>
  );
}
