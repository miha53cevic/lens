import { plural } from '../../shared.ts';

/** A file's notes, the reader's own, in the tree: a dot, and how many past one (a change shows them as its signals). */
export function NoteMark({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span
      data-part='note-mark'
      className='inline-flex items-center gap-1 font-mono text-2xs text-accent [--dot:var(--accent)]'
      title={plural(count, 'note') + ' of yours'}
    >
      <span className='dot' />
      {count > 1 && count}
    </span>
  );
}
