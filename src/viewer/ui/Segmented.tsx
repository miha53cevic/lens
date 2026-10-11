import type { ReactNode } from 'react';
import clsx from 'clsx';
import './Segmented.css';

interface Option<T> {
  value: T;
  label: string;
  title?: string;
  /** Before the label */
  icon?: ReactNode;
}

interface SegmentedProps<T extends string | number> {
  id?: string;
  /** What is being picked: the group's accessible name */
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  /** md: a setting among others (the fold level) · lg: what a whole screen switches on */
  size?: 'md' | 'lg';
}

/** One of a few values, side by side (the fold level). */
export function Segmented<T extends string | number>({
  id,
  label,
  options,
  value,
  onChange,
  size = 'md',
}: SegmentedProps<T>) {
  return (
    <div className={clsx('seg', size === 'lg' && 'seg-lg')} id={id} role='radiogroup' aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          role='radio'
          aria-checked={option.value === value}
          data-value={option.value}
          title={option.title}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}
