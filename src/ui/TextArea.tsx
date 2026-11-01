import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

interface TextAreaProps extends ComponentProps<'textarea'> {
  /** The code's font */
  mono?: boolean;
}

/**
 * Text of more than one line to type (a question to the agent): ui/Field's border and focus, in a
 * box that grows. One line is ui/Field.
 */
export function TextArea({ mono, className, ...props }: TextAreaProps) {
  return (
    <textarea
      {...props}
      data-part='textarea'
      className={cn(
        'min-h-0 w-full resize-none rounded-md border border-line-strong bg-surface px-3 py-2 leading-[1.45] text-text [transition:border-color_var(--motion)] placeholder:text-faint focus:border-field-focus focus:outline-none disabled:opacity-60',
        mono && 'font-mono',
        className,
      )}
    />
  );
}
