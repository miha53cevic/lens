import { useCallback, type ReactNode } from 'react';
import { Maximize2 } from 'lucide-react';
import { DIALOG, ModalHead } from '../../ModalHead.tsx';
import { cn } from '../../../../ui/cn.ts';
import { IconButton } from '../../../../ui/IconButton.tsx';

/** The button in a drawing card's head that opens it big. */
export function ExpandButton({ onExpand }: { onExpand: () => void }) {
  return (
    <IconButton data-part='drawing-expand' label='Expand' size='sm' onClick={onExpand}>
      <Maximize2 size={14} />
    </IconButton>
  );
}

interface DrawingDialogProps {
  title: string;
  stale: boolean;
  /** In its head, after the title: the card's Before / Now */
  controls?: ReactNode;
  /** Under the drawing: the card's unit chips or step kinds */
  footer: ReactNode;
  /** It closed (Esc, ✕, a click on the dim around it): the card unmounts it */
  onClose: () => void;
  children: ReactNode;
}

/**
 * A preview or sequence, big: most of the window, the page dimmed around it. Mounted only while
 * open, so a card loads its preview once; it opens itself as it mounts.
 */
export function DrawingDialog({ title, stale, controls, footer, onClose, children }: DrawingDialogProps) {
  const open = useCallback((dialog: HTMLDialogElement | null) => {
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      ref={open}
      data-part='drawing-dialog'
      className={cn(
        DIALOG,
        'h-[calc(var(--screen-h)*0.88)] max-h-[calc(var(--screen-h)*0.88)] w-[min(1400px,calc(var(--screen-w)*0.92))]',
      )}
      onClose={onClose}
      // the dialog itself is under the pointer only on its backdrop: its parts cover the rest
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <ModalHead title={title}>
        {stale && (
          <span data-part='drawing-stale' className='text-sm text-mod'>
            code changed since
          </span>
        )}
        <span className='flex-1' />
        {controls}
      </ModalHead>
      <div data-part='modal-body' className='flex min-h-0 flex-1 flex-col bg-bg p-4'>
        {children}
      </div>
      <footer className='flex flex-none flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-2'>
        {footer}
      </footer>
    </dialog>
  );
}
