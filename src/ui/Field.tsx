import type { CSSProperties, InputHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from './cn.ts';
import { X } from 'lucide-react';
import { IconButton } from './IconButton.tsx';

const HEIGHTS = { sm: 'h-control-sm', md: 'h-control', lg: 'h-control-lg' };

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
      data-part='field'
      data-size={size}
      className={cn(
        // the box takes the border and the focus; a clear button sits closer to the edge than text does
        'flex cursor-text items-center gap-2 rounded-full border border-line-strong bg-surface px-3 text-faint [transition:border-color_var(--motion)] focus-within:border-field-focus has-[button]:pr-1',
        HEIGHTS[size],
        className,
      )}
      id={wrapperId}
      style={style}
      onClick={(event) => event.target === event.currentTarget && event.currentTarget.querySelector('input')?.focus()}
    >
      {icon}
      <input
        ref={inputRef}
        type='text'
        spellCheck={false}
        autoComplete='off'
        {...props}
        className={cn(
          'min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-text outline-none placeholder:text-faint',
          size === 'lg' && 'text-base',
          mono && 'font-mono',
        )}
      />
      {onClear && String(props.value ?? '').trim() !== '' && (
        <IconButton id={clearId} size='sm' label={clearLabel} onClick={onClear}>
          <X size={12} />
        </IconButton>
      )}
    </div>
  );
}
