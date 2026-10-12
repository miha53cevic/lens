import type { ReactNode } from 'react';
import clsx from 'clsx';
import './Segmented.css';

interface Option<T> {
  value: T;
  label: string;
  title?: string;
  id?: string;
  /** Before the label */
  icon?: ReactNode;
  /** After the label: a dot that says something new waits there */
  badge?: ReactNode;
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
  /** The options are tabs: each shows a panel of its own (the ? help's) */
  tabs?: boolean;
}

/** One of a few values, side by side (the fold level, Code | Summary). */
export function Segmented<T extends string | number>({
  id,
  label,
  options,
  value,
  onChange,
  size = 'md',
  tabs = false,
}: SegmentedProps<T>) {
  return (
    <div
      className={clsx('seg', size === 'lg' && 'seg-lg')}
      id={id}
      role={tabs ? 'tablist' : 'radiogroup'}
      aria-label={label}
    >
      {options.map((option) => (
        <button
          key={option.value}
          id={option.id}
          role={tabs ? 'tab' : 'radio'}
          aria-checked={tabs ? undefined : option.value === value}
          aria-selected={tabs ? option.value === value : undefined}
          data-value={option.value}
          title={option.title}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          {option.label}
          {option.badge}
        </button>
      ))}
    </div>
  );
}
