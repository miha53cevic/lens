import type { CSSProperties, ReactNode } from 'react';
import './Chip.css';

interface ChipProps {
  /** Its dot's color */
  color: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}

/** A small toggle with a colored dot (the fold categories). */
export function Chip({ color, checked, onChange, children }: ChipProps) {
  return (
    <label className='chip' style={{ '--chip': color } as CSSProperties}>
      <input type='checkbox' checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className='dot' />
      {children}
    </label>
  );
}
