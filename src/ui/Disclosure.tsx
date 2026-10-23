import type { ButtonHTMLAttributes } from 'react';
import { ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import './Disclosure.css';

interface DisclosureProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Whether what it shows is open: the chevron turns, and aria-expanded says so */
  open: boolean;
}

/**
 * A row that shows or hides what's under it: a chevron, then what it's about (a flow, a possible
 * break, a caller). The whole row is the target, with a list row's hover. A place sets its own
 * color, type and width.
 */
export function Disclosure({ open, className, children, ...props }: DisclosureProps) {
  return (
    <button type='button' {...props} aria-expanded={open} className={clsx('disclosure', className)}>
      <ChevronRight className={clsx('pk', open && 'open')} size={12} />
      {children}
    </button>
  );
}

/** lucide's chevron-right, as the markup the component draws */
const CHEVRON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
  ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right pk">' +
  '<path d="m9 18 6-6-6-6"/></svg>';

/**
 * The same row as a `<details>`'s summary, for markup built as text (an Ask answer): the chevron
 * turns while the details are open. `labelHtml` is already escaped.
 */
export function disclosureSummaryHtml(labelHtml: string): string {
  return '<summary class="disclosure">' + CHEVRON + labelHtml + '</summary>';
}
