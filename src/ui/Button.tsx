import type { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';
import { Tip } from './Tip.tsx';
import './Button.css';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** default: outlined · ghost: no border, a tint under the pointer · primary: the accent · danger: deletes something */
  variant?: 'default' | 'ghost' | 'primary' | 'danger';
  size?: 'md' | 'sm';
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
    <button {...props} className={clsx('btn', 'btn-' + variant, size === 'sm' && 'btn-sm', className)}>
      {children}
      {shortcut && <Tip label={tip} shortcut={shortcut} side={tipSide} />}
    </button>
  );
}
