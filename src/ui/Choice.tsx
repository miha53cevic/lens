import type { ReactNode } from 'react';
import { listRowClass } from './ListRow.tsx';
import './Choice.css';

interface ChoiceProps {
  /** radio: one of the list (the picker's changes) · checkbox: each on its own (what a dialog clears) */
  type: 'radio' | 'checkbox';
  id?: string;
  /** The radios' group */
  name?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** The choice itself, in bold */
  label: ReactNode;
  /** Under it, quieter: what picking it means */
  hint?: ReactNode;
  /** On the right: a count, or the field the choice needs */
  meta?: ReactNode;
  className?: string;
  /** Data attributes, for the page's own use (`data-range`) */
  [data: `data-${string}`]: string | undefined;
}

/**
 * A choice that looks like a row (ui/ListRow), the whole of it one target: picked, it takes the
 * selected look. In a `ChoiceList`.
 */
export function Choice({
  type,
  id,
  name,
  checked,
  onChange,
  disabled,
  label,
  hint,
  meta,
  className,
  ...data
}: ChoiceProps) {
  return (
    <label
      {...data}
      className={listRowClass(checked, 'choice', checked && 'checked', disabled && 'disabled', className)}
    >
      <input
        id={id}
        type={type}
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={type === 'radio' ? 'choice-radio' : 'choice-box'} />
      <span className='choice-text'>
        <span className='choice-name'>{label}</span>
        {hint !== undefined && <span className='choice-sub'>{hint}</span>}
      </span>
      {meta !== undefined && <span className='choice-meta'>{meta}</span>}
    </label>
  );
}

interface ChoiceListProps {
  /** radio: the list is one pick (a radiogroup) · checkbox: a group of ticks */
  type: 'radio' | 'checkbox';
  label: string;
  children: ReactNode;
}

/** The rows of choices, close together. */
export function ChoiceList({ type, label, children }: ChoiceListProps) {
  return (
    <div className='choices' role={type === 'radio' ? 'radiogroup' : 'group'} aria-label={label}>
      {children}
    </div>
  );
}
