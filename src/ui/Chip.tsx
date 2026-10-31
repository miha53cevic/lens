import type { CSSProperties, ReactNode } from 'react';
import './Chip.css';

interface ChipProps {
  id?: string;
  /** Its dot's color, and its tint when on. Without one: no dot, and the accent (search's word and case). */
  color?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}

/** A small toggle, with a colored dot for the fold categories. */
export function Chip({ id, color, checked, onChange, children }: ChipProps) {
  return (
    <label className='chip' style={color ? ({ '--chip': color } as CSSProperties) : undefined}>
      <input id={id} type='checkbox' checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {color && <span className='dot' />}
      {children}
    </label>
  );
}
