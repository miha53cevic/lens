import type { MouseEvent, ReactNode, Ref } from 'react';
import { cn } from './cn.ts';
import { X } from 'lucide-react';
import { IconButton } from './IconButton.tsx';

/** A button on a tab, shown on the tab in front and on the one under the pointer. */
export const TAB_BUTTON =
  'invisible group-hover/tab:visible group-focus-within/tab:visible group-data-active/tab:visible';

interface TabProps {
  active: boolean;
  /** What the tab shows: an icon or a status, the name, a detail */
  children: ReactNode;
  onSelect: () => void;
  onDoubleClick?: () => void;
  onClose: () => void;
  /** A right-click on it: the page's own menu for the tab */
  onContextMenu?: (event: MouseEvent) => void;
  /** The close button's name: "Close orders.ts" */
  closeLabel: string;
  /** More buttons before the close one (ui/IconButton, size sm): shown with it */
  actions?: ReactNode;
  /** The code's font, for a tab named by a file */
  mono?: boolean;
  /**
   * Joined to the editor under it, as an editor's tabs are (the viewer's file tabs): square, ruled
   * off from the next, the one in front in the editor's own surface with the accent along its top.
   */
  flat?: boolean;
  className?: string;
  /** On the tab (the strip widens it in) */
  tabRef?: Ref<HTMLDivElement>;
  /** On its main button (to bring the tab in front into sight) */
  mainRef?: Ref<HTMLButtonElement>;
  /** Data attributes, for the page's own use (`data-file`, `data-tab`) */
  [data: `data-${string}`]: string | number | undefined;
}

/**
 * One tab of a row of them (`role='tablist'` on the row): a soft pill, the selected look in front.
 * The middle button closes it, as in a browser; its buttons show on the tab in front and under the pointer.
 */
export function Tab({
  active,
  children,
  onSelect,
  onDoubleClick,
  onClose,
  onContextMenu,
  closeLabel,
  actions,
  mono,
  flat,
  className,
  tabRef,
  mainRef,
  ...data
}: TabProps) {
  return (
    <div
      {...data}
      data-part='tab'
      data-active={active || undefined}
      ref={tabRef}
      className={cn(
        // the focus ring goes around the whole tab, its buttons included
        'group/tab flex max-w-[280px] flex-none items-center rounded-full border border-transparent pr-1 text-sm whitespace-nowrap text-muted select-none hover:text-text has-[[role=tab]:focus-visible]:outline-2 has-[[role=tab]:focus-visible]:outline-offset-2 has-[[role=tab]:focus-visible]:outline-focus data-active:border-selected-ring data-active:bg-selected-bg data-active:text-text',
        mono && 'font-mono',
        flat &&
          'h-full rounded-none border-0 border-r border-line pr-2 data-active:border-line data-active:bg-surface data-active:shadow-[inset_0_1px_0_var(--accent)] [&>[role=tab]]:rounded-none [&>[role=tab]]:pl-4',
        className,
      )}
      onAuxClick={(event: MouseEvent) => {
        if (event.button === 1) onClose();
      }}
      onContextMenu={onContextMenu}
    >
      <button
        ref={mainRef}
        data-part='tab-main'
        className='flex min-w-0 items-center gap-2 rounded-full py-1 pr-1 pl-3 text-inherit leading-[1.5] focus-visible:outline-none [&_svg]:flex-none'
        role='tab'
        aria-selected={active}
        onClick={onSelect}
        onDoubleClick={onDoubleClick}
      >
        {children}
      </button>
      {actions}
      <IconButton
        size='sm'
        className={TAB_BUTTON}
        data-part='tab-close'
        label={closeLabel}
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        <X size={12} />
      </IconButton>
    </div>
  );
}
