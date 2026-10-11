import './Segmented.css';

interface Option<T> {
  value: T;
  label: string;
  title?: string;
}

interface SegmentedProps<T extends string | number> {
  id?: string;
  /** What is being picked: the group's accessible name */
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** One of a few values, side by side (the fold level). */
export function Segmented<T extends string | number>({ id, label, options, value, onChange }: SegmentedProps<T>) {
  return (
    <div className='seg' id={id} role='radiogroup' aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          role='radio'
          aria-checked={option.value === value}
          data-value={option.value}
          title={option.title}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
