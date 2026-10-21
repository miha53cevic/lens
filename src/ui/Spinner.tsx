import clsx from 'clsx';
import { LoaderCircle } from 'lucide-react';

interface SpinnerProps {
  size?: number;
  className?: string;
}

/**
 * Work going on that isn't the page's to show (a status, an agent writing): it turns, even with
 * less motion. What's on its way to the page is a ui/Skeleton instead.
 */
export function Spinner({ size = 13, className }: SpinnerProps) {
  return <LoaderCircle size={size} className={clsx('spinner spin', className)} aria-hidden='true' />;
}
