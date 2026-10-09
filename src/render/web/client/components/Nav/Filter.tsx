import { Search, X } from 'lucide-react';
import { hiddenStyle } from '../../shared.ts';

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
    <div className='nav-filter' id={wrapperId} style={hiddenStyle(hidden)}>
      <Search size={13} className='nav-filter-icon' />
      <input
        id={inputId}
        type='text'
        placeholder={placeholder}
        spellCheck={false}
        autoComplete='off'
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          onChange('');
          event.currentTarget.blur();
        }}
      />
      <button
        id={clearId}
        title='clear filter (Esc)'
        aria-label='clear filter'
        style={hiddenStyle(value.trim() === '')}
        onClick={() => onChange('')}
      >
        <X size={12} />
      </button>
    </div>
  );
}
