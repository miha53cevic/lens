import type { ReactNode } from 'react';
import clsx from 'clsx';
import { listRow } from './ListRow.tsx';

// the mark: a dot for one of the list, a tick for each on its own; the accent once picked
const MARK = 'size-[14px] border-[1.5px] border-line-strong';
const RADIO =
  'rounded-full group-data-checked/choice:border-accent group-data-checked/choice:bg-[radial-gradient(circle,var(--accent)_0_3.5px,transparent_4.5px)]';
// the tick is always there, at nothing until ticked: ticking grows it, unticking is at once
const BOX =
  "inline-grid place-items-center rounded-xs [transition:background_var(--motion),border-color_var(--motion)] group-data-checked/choice:border-accent group-data-checked/choice:bg-accent after:h-[3px] after:w-[7px] after:border-2 after:border-t-0 after:border-r-0 after:border-accent-fg after:[transform:translateY(-1px)_rotate(-45deg)_scale(0)] after:content-[''] group-data-checked/choice:after:[transform:translateY(-1px)_rotate(-45deg)_scale(1)] group-data-checked/choice:after:[transition:transform_var(--motion-enter)]";

interface ChoiceProps {
  /** radio: one of the list (the picker's changes) · checkbox: each on its own (what a dialog clears) */
  type: 'radio' | 'checkbox';
  id?: string;
  /** The radios' group */
  name?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** The choice itself, in bold */
  label: ReactNode;
  /** Under it, quieter: what picking it means */
  hint?: ReactNode;
  /** On the right: a count, or the field the choice needs */
  meta?: ReactNode;
  className?: string;
  /** Data attributes, for the page's own use (`data-range`) */
  [data: `data-${string}`]: string | undefined;
}

/**
 * A choice that looks like a row (ui/ListRow), the whole of it one target: picked, it takes the
 * selected look. In a `ChoiceList`.
 */
export function Choice({
  type,
  id,
  name,
  checked,
  onChange,
  disabled,
  label,
  hint,
  meta,
  className,
  ...data
}: ChoiceProps) {
  return (
    <label
      {...data}
      {...listRow(
        checked,
        clsx(
          // its own input's ring only: a field in the row (the picker's custom arguments) is the field's
          'group/choice grid cursor-pointer grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 has-[>input:focus-visible]:outline-2 has-[>input:focus-visible]:outline-offset-2 has-[>input:focus-visible]:outline-focus data-disabled:cursor-default data-disabled:opacity-55',
          className,
        ),
      )}
      data-part='choice'
      data-checked={checked || undefined}
      data-disabled={disabled || undefined}
    >
      <input
        className='pointer-events-none absolute opacity-0'
        id={id}
        type={type}
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span data-part={'choice-' + type} className={clsx(MARK, type === 'radio' ? RADIO : BOX)} />
      <span className='grid min-w-0'>
        <span className='flex items-center gap-2 font-semibold text-text'>{label}</span>
        {hint !== undefined && (
          <span data-part='choice-sub' className='overflow-hidden text-sm text-ellipsis whitespace-nowrap text-muted'>
            {hint}
          </span>
        )}
      </span>
      {meta !== undefined && (
        <span data-part='choice-meta' className='text-sm whitespace-nowrap text-faint'>
          {meta}
        </span>
      )}
    </label>
  );
}

interface ChoiceListProps {
  /** radio: the list is one pick (a radiogroup) · checkbox: a group of ticks */
  type: 'radio' | 'checkbox';
  label: string;
  children: ReactNode;
}

/** The rows of choices, close together. */
export function ChoiceList({ type, label, children }: ChoiceListProps) {
  return (
    <div className='grid gap-1' role={type === 'radio' ? 'radiogroup' : 'group'} aria-label={label}>
      {children}
    </div>
  );
}
