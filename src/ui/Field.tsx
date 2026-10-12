import type { CSSProperties, InputHTMLAttributes, ReactNode, Ref } from 'react';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { IconButton } from './IconButton.tsx';
import './Field.css';

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'className' | 'style'> {
  /** sm: beside other controls · md: a filter · lg: what a dialog or a screen is about */
  size?: 'sm' | 'md' | 'lg';
  /** Before the text */
  icon?: ReactNode;
  /** A ref, a range, a number: typed in the code font */
  mono?: boolean;
  /** Shows a clear button while there is text */
  onClear?: () => void;
  clearId?: string;
  clearLabel?: string;
  /** The field's box, around the input: its class, style and id */
  className?: string;
  style?: CSSProperties;
  wrapperId?: string;
  inputRef?: Ref<HTMLInputElement>;
}

/** One line of text to type: the box, an icon before the text, a clear button after it. */
export function Field({
  size = 'md',
  icon,
  mono,
  onClear,
  clearId,
  clearLabel = 'clear',
  className,
  style,
  wrapperId,
  inputRef,
  ...props
}: FieldProps) {
  return (
    // a div, not a label: a field may sit inside one (a choice's row). A click on the box still lands in the input.
    <div
      className={clsx('field', 'field-' + size, mono && 'field-mono', className)}
      id={wrapperId}
      style={style}
      onClick={(event) => event.target === event.currentTarget && event.currentTarget.querySelector('input')?.focus()}
    >
      {icon}
      <input ref={inputRef} type='text' spellCheck={false} autoComplete='off' {...props} />
      {onClear && String(props.value ?? '').trim() !== '' && (
        <IconButton id={clearId} size='sm' label={clearLabel} onClick={onClear}>
          <X size={12} />
        </IconButton>
      )}
    </div>
  );
}
