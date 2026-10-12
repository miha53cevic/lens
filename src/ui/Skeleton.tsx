import clsx from 'clsx';
import './Skeleton.css';

interface SkeletonProps {
  /** A line of text (as tall as the type around it), an icon, or a control of that height */
  size?: 'text' | 'icon' | 'xs' | 'sm' | 'md' | 'lg';
  /** Any CSS width (`14ch`, `168px`); the whole line without one */
  width?: string;
  /** A pill: a chip, a segmented control */
  round?: boolean;
  className?: string;
}

/**
 * A placeholder for what isn't there yet, in the shape of what is coming. Only for that: what
 * is already on screen stays while it is loaded again, and what nothing is loading gets none.
 */
export function Skeleton({ size = 'text', width, round, className }: SkeletonProps) {
  return (
    <span
      className={clsx('skeleton', size !== 'text' && 'skeleton-' + size, round && 'skeleton-round', className)}
      style={width ? { width } : undefined}
      aria-hidden='true'
    />
  );
}
