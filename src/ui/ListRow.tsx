import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

// under the pointer, unless it is the selected one: that keeps its own look
const LIST_ROW =
  'rounded-md text-left text-muted motion-bg not-disabled:not-data-disabled:not-data-selected:hover:bg-hover-bg not-disabled:not-data-disabled:not-data-selected:hover:text-text data-selected:bg-selected-bg data-selected:text-text data-selected:shadow-[0_0_0_1px_var(--selected-ring)]';

/**
 * A row's look in a list (the file tree, the summary list, search hits, recent folders): a tint
 * under the pointer, the selected look when it's the one open. Its layout is the list's own.
 * On an element that isn't a button (a row holding buttons of its own), spread `listRow`.
 */
export function listRow(selected: boolean, className?: string) {
  return { 'data-part': 'list-row', className: cn(LIST_ROW, className), 'data-selected': selected || undefined };
}

interface ListRowProps extends ComponentProps<'button'> {
  selected?: boolean;
}

/** A row of a list that opens what it names. */
export function ListRow({ selected = false, className, ...props }: ListRowProps) {
  return <button {...listRow(selected, className)} {...props} />;
}
