import type { ComponentProps } from 'react';
import clsx from 'clsx';
import './ListRow.css';

/**
 * A row's look in a list (the file tree, the summary list, search hits, recent folders): a tint
 * under the pointer, the selected look when it's the one open. Its layout is the list's own.
 * On an element that isn't a button (a row holding buttons of its own), use `listRowClass`.
 */
export function listRowClass(selected: boolean, ...classes: (string | false | null | undefined)[]): string {
  return clsx('list-row', selected && 'selected', ...classes);
}

interface ListRowProps extends ComponentProps<'button'> {
  selected?: boolean;
}

/** A row of a list that opens what it names. */
export function ListRow({ selected = false, className, ...props }: ListRowProps) {
  return <button {...props} className={listRowClass(selected, className)} />;
}
