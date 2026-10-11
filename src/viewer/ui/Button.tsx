import type { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';
import './Button.css';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** default: outlined · ghost: no border until hovered · primary: the accent */
  variant?: 'default' | 'ghost' | 'primary';
  size?: 'md' | 'sm';
}

/** A button with a label (and maybe an icon before it). Icon-only buttons are IconButton. */
export function Button({ variant = 'default', size = 'md', className, ...props }: ButtonProps) {
  return <button {...props} className={clsx('btn', 'btn-' + variant, size === 'sm' && 'btn-sm', className)} />;
}
