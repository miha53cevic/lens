import { Search } from 'lucide-react';
import { hiddenStyle } from '../../shared.ts';
import { Field } from '../../../ui/Field.tsx';

interface FilterProps {
  inputId?: string;
  clearId?: string;
  wrapperId?: string;
  hidden: boolean;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}

/** A filter box over the tree or the list: Esc or ✕ clears it. */
export function Filter({ inputId, clearId, wrapperId, hidden, placeholder, value, onChange }: FilterProps) {
  return (
    <Field
      className='nav-filter'
      wrapperId={wrapperId}
      style={hiddenStyle(hidden)}
      icon={<Search size={13} />}
      id={inputId}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        onChange('');
        event.currentTarget.blur();
      }}
      onClear={() => onChange('')}
      clearId={clearId}
      clearLabel='clear filter'
    />
  );
}
