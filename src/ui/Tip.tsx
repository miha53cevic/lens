import clsx from 'clsx';
import { Kbd } from './Kbd.tsx';
import './Tip.css';

interface TipProps {
  /** What the control does */
  label?: string;
  /** Its key: a tooltip is there to teach it */
  shortcut: string;
  /** Which edge of the control it lines up with: end (the default) for controls on the right, start for ones on the left */
  side?: 'start' | 'end';
}

/** A tooltip under the control it is in, on hover and on keyboard focus. Button and IconButton show one for a key. */
export function Tip({ label, shortcut, side = 'end' }: TipProps) {
  return (
    <span className={clsx('tip', side === 'start' && 'tip-start')} aria-hidden>
      {label} <Kbd combo={shortcut} />
    </span>
  );
}
