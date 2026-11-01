// The Ask rail: the chat with the reader's agent about the open change.

import { X } from 'lucide-react';
import { useLens } from '../../store.ts';
import { askSetOpen } from '../../ask/rail.ts';
import { Thread } from './Thread.tsx';
import { Composer } from './Composer.tsx';
import { IconButton } from '../../../ui/IconButton.tsx';

export function AskRail() {
  const { open, width, listening } = useLens((state) => ({
    open: state.ask.open,
    width: state.ask.width,
    listening: state.ask.data.listening,
  }));

  return (
    <aside
      id='ask-rail'
      className='flex w-[360px] min-w-0 flex-none flex-col bg-bg text-md'
      style={{ width: width + 'px', display: open ? undefined : 'none' }}
    >
      <div className='flex h-[44px] flex-none items-center gap-2 border-b border-line pr-2 pl-4'>
        <span className='font-serif text-lg font-bold'>Ask</span>
        <span className='flex-1' />
        <span className='inline-flex items-center gap-2 text-xs text-muted' id='ask-status'>
          <span className={listening ? 'dot pulse [--dot:var(--add)]' : 'dot [--dot:var(--faint)]'} />
          {listening ? 'agent listening' : 'no agent'}
        </span>
        <IconButton id='ask-close' label='Hide the Ask rail' onClick={() => askSetOpen(false)}>
          <X size={14} />
        </IconButton>
      </div>
      <Thread />
      <Composer />
    </aside>
  );
}
