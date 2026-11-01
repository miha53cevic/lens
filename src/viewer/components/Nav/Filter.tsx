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
      data-part='nav-filter'
      className='sticky top-[calc(-1*var(--space-4))] z-(--z-sticky) mb-2'
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
