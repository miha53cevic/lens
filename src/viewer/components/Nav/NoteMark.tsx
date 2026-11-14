import type { NoteKindCount } from '../../model/notes.ts';
import { plural } from '../../shared.ts';
import { SignalIcon } from '../SignalIcon.tsx';
import { tipAttrs } from '../../../ui/Tip.tsx';

/** A file's notes, the reader's own, in the tree: each kind's signal icon, as a change's card shows them, and how many past one. */
export function NoteMark({ kinds }: { kinds: readonly NoteKindCount[] | undefined }) {
  if (!kinds) return null;
  return (
    <span data-part='note-mark' className='inline-flex items-center gap-1'>
      {kinds.map(({ kind, count }) => (
        <span
          key={kind}
          className={'sig-' + kind + ' inline-flex items-center gap-1 font-mono text-2xs text-(--sig)'}
          {...tipAttrs(plural(count, kind) + ' of yours')}
        >
          <SignalIcon signal={kind} size={12} />
          {count > 1 && count}
        </span>
      ))}
    </span>
  );
}
