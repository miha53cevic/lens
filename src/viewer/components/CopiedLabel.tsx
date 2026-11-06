import type { ReactNode } from 'react';
import clsx from 'clsx';
import { Check } from 'lucide-react';

/**
 * A copy button's label, and "Copied" over it once it copied. The label stays laid out, invisible,
 * so the button keeps its width and nothing beside it moves.
 */
export function CopiedLabel({ copied, size, children }: { copied: boolean; size: number; children: ReactNode }) {
  // the button's own gap between its icon and its words: an xs button's is the smaller
  const gap = size < 13 ? 'gap-1' : 'gap-2';
  return (
    <span className='relative inline-flex'>
      <span aria-hidden={copied} className={clsx('inline-flex items-center', gap, copied && 'invisible')}>
        {children}
      </span>
      {copied && (
        <span className={clsx('absolute inset-0 inline-flex items-center justify-center', gap)}>
          <Check size={size} /> Copied
        </span>
      )}
    </span>
  );
}
