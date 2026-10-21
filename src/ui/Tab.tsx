import type { MouseEvent, ReactNode, Ref } from 'react';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { IconButton } from './IconButton.tsx';
import './Tab.css';

interface TabProps {
  active: boolean;
  /** What the tab shows: an icon or a status, the name, a detail */
  children: ReactNode;
  onSelect: () => void;
  onDoubleClick?: () => void;
  onClose: () => void;
  /** The close button's name: "Close orders.ts" */
  closeLabel: string;
  /** More buttons before the close one (ui/IconButton, size sm): shown with it */
  actions?: ReactNode;
  /** The code's font, for a tab named by a file */
  mono?: boolean;
  /** The whole path when the name is cut */
  title?: string;
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
  closeLabel,
  actions,
  mono,
  title,
  className,
  tabRef,
  mainRef,
  ...data
}: TabProps) {
  return (
    <div
      {...data}
      ref={tabRef}
      className={clsx('tab', active && 'active', mono && 'tab-mono', className)}
      title={title}
      onAuxClick={(event: MouseEvent) => {
        if (event.button === 1) onClose();
      }}
    >
      <button
        ref={mainRef}
        className='tab-main'
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
        className='tab-btn tab-close'
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
