import type { CSSProperties, ReactNode } from 'react';
import { cn } from './cn.ts';

interface ChipProps {
  id?: string;
  /** Its dot's color, and its tint when on. Without one: no dot, and the accent (search's word and case). */
  color?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  className?: string;
}

/** A small toggle, with a colored dot for the fold categories. */
export function Chip({ id, color, checked, onChange, children, className }: ChipProps) {
  return (
    <label
      data-part='chip'
      className={cn(
        'relative inline-flex h-control-xs flex-none cursor-pointer items-center gap-1 rounded-full border border-line px-2 text-sm whitespace-nowrap text-muted select-none motion-colors [--tone:var(--accent)] hover:text-text has-checked:border-tone-line has-checked:bg-tone-tint has-checked:text-text has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus',
        className,
      )}
      style={color ? ({ '--tone': color } as CSSProperties) : undefined}
    >
      <input
        id={id}
        className='pointer-events-none absolute opacity-0'
        type='checkbox'
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {color && <span className='dot [--dot:var(--tone)]' />}
      {children}
    </label>
  );
}
