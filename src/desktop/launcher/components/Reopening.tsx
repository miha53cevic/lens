import clsx from 'clsx';
import { ReviewSkeleton } from '../../../ui/ReviewSkeleton.tsx';
import { useApp } from '../store.ts';

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
      data-part='reopening'
      data-over={!reopening || undefined}
      className={clsx(
        // the whole screen, with nothing to press: a review is on its way, and this is its shape
        'flex min-h-0 flex-1 flex-col overflow-hidden motion:[transition:opacity_var(--motion-move)] motion:starting:opacity-0',
        // over the picker, once the wait is worth showing (the status bar waits as long to say it): a review
        // that starts at once never shows it, and with less motion it shows at once; then it fades in
        !reopening && 'absolute inset-0 z-(--z-float) animate-[reopening-wait_150ms] motion:delay-150',
      )}
      id='reopening'
      aria-busy='true'
      aria-label={label}
    >
      <ReviewSkeleton />
    </main>
  );
}
