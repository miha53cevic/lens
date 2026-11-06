import { useCallback, type ReactNode } from 'react';
import clsx from 'clsx';

interface Option<T> {
  value: T;
  label: ReactNode;
  title?: string;
  /** Its name, when the label doesn't say it (an icon and a count) */
  ariaLabel?: string;
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
  /** The options share the whole width (a filter along a sidebar), at a control's full height: a row of its own */
  fill?: boolean;
}

/**
 * One of a few values, side by side (the fold level, Code | Summary). A value no option has
 * picks none: a filter that's off.
 */
export function Segmented<T extends string | number>({
  id,
  label,
  options,
  value,
  onChange,
  size = 'md',
  tabs = false,
  fill = false,
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
      data-part='seg'
      data-size={size}
      className={clsx(
        'group/seg relative rounded-full bg-surface-2 p-1',
        fill ? 'flex w-full' : 'inline-flex flex-none',
        size === 'lg' ? 'h-control-lg' : fill ? 'h-control' : 'h-control-sm',
      )}
      id={id}
      role={tabs ? 'tablist' : 'radiogroup'}
      aria-label={label}
    >
      {/* the picked option's highlight, which slides from one option to the next (placeHighlight); positioned, the options paint over it */}
      <span
        data-part='seg-highlight'
        className='invisible absolute top-1 bottom-1 rounded-full bg-accent group-data-placed/seg:visible group-data-placed/seg:[transition:left_var(--motion-move),width_var(--motion-move)]'
        aria-hidden
      />
      {options.map((option) => (
        <button
          key={option.value}
          id={option.id}
          role={tabs ? 'tab' : 'radio'}
          aria-checked={tabs ? undefined : option.value === value}
          aria-selected={tabs ? option.value === value : undefined}
          data-value={option.value}
          className={clsx(
            'relative inline-flex min-w-[26px] items-center justify-center gap-2 rounded-full text-sm text-muted [transition:background_var(--motion),color_var(--motion)] hover:text-text aria-checked:bg-accent aria-checked:font-semibold aria-checked:text-accent-fg aria-selected:bg-accent aria-selected:font-semibold aria-selected:text-accent-fg group-data-placed/seg:aria-checked:bg-transparent group-data-placed/seg:aria-selected:bg-transparent',
            size === 'lg' ? 'px-4 font-medium' : 'px-2',
            fill && 'flex-1',
          )}
          title={option.title}
          aria-label={option.ariaLabel}
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
  const highlight = group.querySelector<HTMLElement>('[data-part="seg-highlight"]');
  const picked = group.querySelector<HTMLElement>('[aria-checked="true"], [aria-selected="true"]');
  if (!highlight || !picked || picked.offsetWidth === 0) {
    delete group.dataset.placed;
    return;
  }
  highlight.style.left = picked.offsetLeft + 'px';
  highlight.style.width = picked.offsetWidth + 'px';
  group.dataset.placed = '';
}
