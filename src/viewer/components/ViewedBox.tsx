import clsx from 'clsx';
import './ViewedBox.css';

interface ViewedBoxProps {
  checked: boolean;
  /** Ticked once, and the code changed since: a dot where the tick was */
  changed?: boolean;
  onToggle: () => void;
}

/** The tick box in tree rows (a dot in the summary list): a span, since the rows are buttons. */
export function ViewedBox({ checked, changed, onToggle }: ViewedBoxProps) {
  return (
    <span
      className={clsx('viewed-box', changed && 'changed')}
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
