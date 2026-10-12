import clsx from 'clsx';
import { ReviewSkeleton } from '../../../ui/ReviewSkeleton.tsx';
import { useApp } from '../store.ts';
import './Reopening.css';

/**
 * A review on its way to the tab, in the viewer's shape: a tab the app reopened, in place of
 * Start or the picker, or a review the picker started, over that picker (which keeps its pick
 * for a review that fails or is cancelled). The tab says whose it is; the status bar under it
 * says what runs, and holds the Cancel.
 */
export function Reopening() {
  const reopening = useApp((state) => state.reopening !== null);
  const label = useApp((state) => {
    if (!state.reopening) return 'Opening the review';
    const { name, review } = state.reopening;
    return review ? `Reopening ${name}, ${review}` : `Reading ${name}`;
  });
  return (
    <main
      className={clsx('screen reopening', !reopening && 'reopening-over')}
      id='reopening'
      aria-busy='true'
      aria-label={label}
    >
      <ReviewSkeleton />
    </main>
  );
}
