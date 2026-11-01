import type { CSSProperties, ReactNode } from 'react';
import { cn } from './cn.ts';

const TAG =
  'inline-flex h-control-xs max-w-full flex-none items-center gap-1 overflow-hidden rounded-full border border-line-strong px-2 text-xs text-ellipsis whitespace-nowrap text-muted motion-colors';
// with a tone: its color on the border and under it
const TONED = 'border-tone-line bg-tone-tint text-text';
const BUTTON =
  'cursor-pointer hover:bg-hover-bg hover:text-text aria-pressed:border-selected-ring aria-pressed:bg-selected-bg aria-pressed:text-text';
// on, with a tone: its color stronger
const TONED_BUTTON =
  'hover:border-[color-mix(in_oklab,var(--tone)_var(--tint-line-strong),var(--line))] hover:bg-tone-tint aria-pressed:border-tone-line-strong aria-pressed:bg-tone-tint-strong';

interface TagProps {
  children: ReactNode;
  /** Its tone: the border and a tint (a signal's, the question's). Without one: neutral. */
  color?: string;
  /** A dot before it, in this color (what a status or a step is) */
  dot?: string;
  /** Before it, at 11px: a branch, a signal */
  icon?: ReactNode;
  /** The code's font: a path, a unit's name */
  mono?: boolean;
  /** A tag that does something: then it's a button */
  onClick?: () => void;
  /** A button tag that's on (a filter, the picked unit): the selected look, or its tone's */
  pressed?: boolean;
  id?: string;
  title?: string;
  className?: string;
  /** Data attributes, for the page's own use (`data-sig`) */
  [data: `data-${string}`]: string | undefined;
}

/**
 * A short label in a pill: a branch, a file's kind, what a question is about. With `onClick` it's
 * a button (a filter, a unit to open). A toggle in a form or a fold category is ui/Chip.
 */
export function Tag({ children, color, dot, icon, mono, onClick, pressed, id, title, className, ...data }: TagProps) {
  const classes = cn(
    TAG,
    color && TONED,
    mono && 'font-mono',
    onClick && BUTTON,
    onClick && color && TONED_BUTTON,
    className,
  );
  const style = color ? ({ '--tone': color } as CSSProperties) : undefined;
  const hook = { 'data-part': 'tag', 'data-toned': color ? '' : undefined };
  const inner = (
    <>
      {dot && <span className='dot' style={{ '--dot': dot } as CSSProperties} />}
      {icon && <span className={cn('inline-flex flex-none', color && 'text-tone')}>{icon}</span>}
      {children}
    </>
  );
  if (!onClick) {
    return (
      <span {...hook} {...data} id={id} className={classes} style={style} title={title}>
        {inner}
      </span>
    );
  }
  return (
    <button
      {...hook}
      {...data}
      id={id}
      type='button'
      className={classes}
      style={style}
      title={title}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {inner}
    </button>
  );
}
