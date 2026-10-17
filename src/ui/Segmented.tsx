import { useCallback, type ReactNode } from 'react';
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
  // A new callback for each value: React calls it again once the new pick is drawn, and the
  // highlight slides there. It also follows the options' size (a font, a badge, being shown).
  const followPick = useCallback(
    (group: HTMLDivElement | null) => {
      if (!group) return;
      placeHighlight(group);
      if (typeof ResizeObserver !== 'function') return;
      const observer = new ResizeObserver(() => placeHighlight(group));
      observer.observe(group);
      return () => observer.disconnect();
    },
    [value],
  );
  return (
    <div
      ref={followPick}
      className={clsx('seg', size === 'lg' && 'seg-lg')}
      id={id}
      role={tabs ? 'tablist' : 'radiogroup'}
      aria-label={label}
    >
      <span className='seg-highlight' aria-hidden />
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

/**
 * Puts the highlight under the picked option. Until it can (an option not laid out yet, as while
 * hidden), the option draws its own, without moving.
 */
function placeHighlight(group: HTMLElement) {
  const highlight = group.querySelector<HTMLElement>('.seg-highlight');
  const picked = group.querySelector<HTMLElement>('[aria-checked="true"], [aria-selected="true"]');
  if (!highlight || !picked || picked.offsetWidth === 0) {
    group.classList.remove('seg-placed');
    return;
  }
  highlight.style.left = picked.offsetLeft + 'px';
  highlight.style.width = picked.offsetWidth + 'px';
  group.classList.add('seg-placed');
}
