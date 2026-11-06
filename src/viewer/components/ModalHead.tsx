import { X } from 'lucide-react';
import { IconButton } from '../../ui/IconButton.tsx';

/**
 * Every dialog: a raised card over a dimmed page. The title row stays and only the body scrolls. It rises
 * in over a page that dims and goes quicker than it came; it takes keys at once.
 */
export const DIALOG =
  'max-h-[calc(var(--screen-h)*0.8)] w-[min(620px,calc(var(--screen-w)*0.9))] overflow-hidden rounded-lg border border-line-strong bg-raised p-0 text-text opacity-0 shadow-3 [scale:0.98] [transition:opacity_var(--motion-exit),translate_var(--motion-exit),scale_var(--motion-exit),display_var(--motion-exit)_allow-discrete,overlay_var(--motion-exit)_allow-discrete] [translate:0_8px] [&[open]]:flex [&[open]]:flex-col [&[open]]:opacity-100 [&[open]]:[scale:1] [&[open]]:[transition:opacity_var(--motion-enter),translate_var(--motion-enter),scale_var(--motion-enter),display_var(--motion-enter)_allow-discrete,overlay_var(--motion-enter)_allow-discrete] [&[open]]:[translate:0_0] starting:[&[open]]:opacity-0 starting:[&[open]]:[scale:0.98] starting:[&[open]]:[translate:0_8px] backdrop:bg-scrim backdrop:opacity-0 backdrop:[transition:opacity_var(--motion-exit),display_var(--motion-exit)_allow-discrete,overlay_var(--motion-exit)_allow-discrete] [&[open]]:backdrop:opacity-100 [&[open]]:backdrop:[transition:opacity_var(--motion-enter),display_var(--motion-enter)_allow-discrete,overlay_var(--motion-enter)_allow-discrete] starting:[&[open]]:backdrop:opacity-0';

/** A modal's title row; its close button closes the <dialog> natively. */
export function ModalHead({ title }: { title: string }) {
  return (
    <div className='flex flex-none items-center gap-3 border-b border-line bg-raised py-1 pr-2 pl-4'>
      <span className='font-serif text-lg font-bold'>{title}</span>
      <span className='flex-1' />
      <form method='dialog'>
        <IconButton label='Close'>
          <X size={15} />
        </IconButton>
      </form>
    </div>
  );
}
