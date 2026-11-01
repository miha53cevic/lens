import { cn } from './cn.ts';

const SIZES = {
  // a line of text: the letters' height, in the middle of the line the real text will take
  text: 'h-[0.7em] rounded-sm',
  icon: 'size-4 rounded-xs',
  xs: 'h-control-xs rounded-md',
  sm: 'h-control-sm rounded-md',
  md: 'h-control rounded-md',
  lg: 'h-control-lg rounded-md',
};

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
      data-round={round || undefined}
      className={cn('skeleton', SIZES[size], round && 'rounded-full', className)}
      style={width ? { width } : undefined}
      aria-hidden='true'
    />
  );
}
