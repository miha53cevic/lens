import { ChevronDown } from 'lucide-react';
import './Select.css';

interface SelectOption {
  value: string;
  label?: string;
}

interface SelectProps {
  id?: string;
  /** What is being picked: its accessible name */
  label: string;
  value: string;
  options: (string | SelectOption)[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * One value from a list too long to show side by side (a branch): a chip that opens the system's
 * own list, as wide as what's picked. A few values side by side are ui/Segmented.
 */
export function Select({ id, label, value, options, onChange, disabled }: SelectProps) {
  return (
    // the select is the chip; the caret lies over it
    <span className='select'>
      <select
        id={id}
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => {
          const { value: optionValue, label: optionLabel } = typeof option === 'string' ? { value: option } : option;
          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel ?? optionValue}
            </option>
          );
        })}
      </select>
      <ChevronDown size={11} />
    </span>
  );
}
