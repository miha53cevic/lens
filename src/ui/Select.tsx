import { ChevronDown } from 'lucide-react';

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
    <span data-part='select' className='relative inline-flex max-w-[260px] min-w-0 items-center'>
      <select
        className='h-control-xs max-w-full cursor-pointer appearance-none overflow-hidden rounded-full border border-line-strong bg-surface pr-6 pl-3 text-sm font-normal text-ellipsis whitespace-nowrap text-text [field-sizing:content] [transition:border-color_var(--motion)] not-disabled:hover:border-field-focus focus:border-field-focus focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-default disabled:opacity-50'
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
      <ChevronDown className='pointer-events-none absolute right-[9px] text-muted' size={11} />
    </span>
  );
}
