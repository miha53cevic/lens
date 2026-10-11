import './ViewedBox.css';

interface ViewedBoxProps {
  checked: boolean;
  onToggle: () => void;
}

/** The tick box in tree rows (a dot in the summary list): a span, since the rows are buttons. */
export function ViewedBox({ checked, onToggle }: ViewedBoxProps) {
  return (
    <span
      className='viewed-box'
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
