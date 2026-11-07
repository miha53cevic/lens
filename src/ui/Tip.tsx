import clsx from 'clsx';
import { Kbd } from './Kbd.tsx';

interface TipProps {
  /** What the control does */
  label?: string;
  /** Its key: a tooltip is there to teach it */
  shortcut: string;
  /** Which edge of the control it lines up with: end (the default) for controls on the right, start for ones on the left */
  side?: 'start' | 'end';
}

/**
 * A tooltip under the control it is in, on hover and on keyboard focus. Button and IconButton show
 * one for a key. Not on a disabled control: its key does nothing then.
 */
export function Tip({ label, shortcut, side = 'end' }: TipProps) {
  return (
    <span
      data-part='tip'
      data-side={side}
      className={clsx(
        // it settles in from its control
        'pointer-events-none absolute top-[calc(100%+var(--space-2))] z-(--z-tip) inline-flex items-center gap-2 rounded-md border border-line-strong bg-raised py-1 pr-2 pl-3 font-sans text-sm/[1.3] font-normal whitespace-nowrap text-text opacity-0 shadow-1 [transition:opacity_var(--motion),translate_var(--motion)] [translate:0_-3px] [:focus-visible>&]:opacity-100 [:focus-visible>&]:delay-(--tip-delay) [:focus-visible>&]:[translate:0_0] [:hover:not(:disabled)>&]:opacity-100 [:hover:not(:disabled)>&]:delay-(--tip-delay) [:hover:not(:disabled)>&]:[translate:0_0]',
        side === 'start' ? 'left-0' : 'right-0',
      )}
      aria-hidden
    >
      {label} <Kbd combo={shortcut} />
    </span>
  );
}
