interface ViewedBoxProps {
  checked: boolean;
  onToggle: () => void;
}

/** The tick box in tree and summary list rows: a span, since the rows are buttons. */
export function ViewedBox({ checked, onToggle }: ViewedBoxProps) {
  return (
    <span
      className='viewed-box'
      role='checkbox'
      aria-checked={checked}
      title='mark viewed'
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    />
  );
}
