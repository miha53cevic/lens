import { Minus, Plus } from 'lucide-react';
import { IconButton } from './IconButton.tsx';

interface StepperProps {
  id?: string;
  /** What is being set: the group's accessible name */
  label: string;
  /** The value as the reader sees it: "12px" */
  value: string;
  /** What the two buttons do, for a screen reader: "Smaller", "Larger" */
  lessLabel: string;
  moreLabel: string;
  /** The value is the first or the last there is: that button is off */
  atMin?: boolean;
  atMax?: boolean;
  onStep: (delta: -1 | 1) => void;
}

/** A value among many in a row, one step at a time (the code's size), on the Segmented's track so the two sit together in a menu. A few values are a Segmented. */
export function Stepper({ id, label, value, lessLabel, moreLabel, atMin, atMax, onStep }: StepperProps) {
  return (
    <div
      data-part='stepper'
      className='inline-flex h-control-sm flex-none items-center gap-1 rounded-full bg-surface-2 px-1'
      id={id}
      role='group'
      aria-label={label}
    >
      <IconButton label={lessLabel} size='sm' disabled={atMin} onClick={() => onStep(-1)}>
        <Minus size={13} />
      </IconButton>
      <output className='min-w-[5ch] text-center text-sm text-text tabular-nums' aria-live='polite'>
        {value}
      </output>
      <IconButton label={moreLabel} size='sm' disabled={atMax} onClick={() => onStep(1)}>
        <Plus size={13} />
      </IconButton>
    </div>
  );
}
