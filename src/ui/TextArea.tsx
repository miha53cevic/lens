import type { ComponentProps } from 'react';
import clsx from 'clsx';
import './TextArea.css';

interface TextAreaProps extends ComponentProps<'textarea'> {
  /** The code's font */
  mono?: boolean;
}

/**
 * Text of more than one line to type (a question to the agent): ui/Field's border and focus, in a
 * box that grows. One line is ui/Field.
 */
export function TextArea({ mono, className, ...props }: TextAreaProps) {
  return <textarea {...props} className={clsx('textarea', mono && 'textarea-mono', className)} />;
}
