import clsx from 'clsx';

interface ViewedBoxProps {
  checked: boolean;
  /** Ticked once, and the code changed since: a dot where the tick was */
  changed?: boolean;
  onToggle: () => void;
}

/** The tick box in the tree's and the summary list's rows: a span, since the rows are buttons. */
export function ViewedBox({ checked, changed, onToggle }: ViewedBoxProps) {
  return (
    <span
      data-part='viewed-box'
      data-changed={changed || undefined}
      className={clsx(
        // the tick is always there, at nothing until ticked: ticking grows it, unticking is at once
        "inline-grid size-[13px] flex-none cursor-pointer place-items-center rounded-xs border-[1.5px] border-line-strong [transition:background_var(--motion),border-color_var(--motion)] after:content-[''] hover:border-add",
        changed
          ? // ticked once, changed since: dashed in the "modified" color, a dot where the tick was
            'border-dashed border-mod after:size-[5px] after:rounded-full after:bg-mod'
          : 'after:h-[3px] after:w-[6px] after:border-2 after:border-t-0 after:border-r-0 after:border-surface after:[transform:translateY(-1px)_rotate(-45deg)_scale(0)] aria-checked:border-add aria-checked:bg-add aria-checked:after:[transform:translateY(-1px)_rotate(-45deg)_scale(1)] aria-checked:after:[transition:transform_var(--motion-enter)]',
      )}
      role='checkbox'
      aria-checked={checked}
      aria-label='viewed'
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    />
  );
}
