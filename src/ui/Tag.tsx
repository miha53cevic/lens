import type { CSSProperties, ReactNode } from 'react';
import clsx from 'clsx';
import './Tag.css';

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
  const classes = clsx('tag', color && 'tag-toned', mono && 'tag-mono', onClick && 'tag-button', className);
  const style = color ? ({ '--tag': color } as CSSProperties) : undefined;
  const inner = (
    <>
      {dot && <span className='dot' style={{ '--dot': dot } as CSSProperties} />}
      {icon && <span className='tag-icon'>{icon}</span>}
      {children}
    </>
  );
  if (!onClick) {
    return (
      <span {...data} id={id} className={classes} style={style} title={title}>
        {inner}
      </span>
    );
  }
  return (
    <button
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
