// The Ask rail: the chat with the reader's agent about the open change.

import { X } from 'lucide-react';
import { useLens } from '../../store.ts';
import { askSetOpen } from '../../ask/rail.ts';
import { Thread } from './Thread.tsx';
import { Composer } from './Composer.tsx';
import { IconButton } from '../../ui/IconButton.tsx';
import './style.css';

export function AskRail() {
  const { open, width, listening } = useLens((state) => ({
    open: state.ask.open,
    width: state.ask.width,
    listening: state.ask.data.listening,
  }));

  return (
    <aside id='ask-rail' style={{ width: width + 'px', display: open ? undefined : 'none' }}>
      <div className='ask-head'>
        <span className='ask-title'>Ask</span>
        <span className='spacer' />
        <span className='ask-status' id='ask-status'>
          <span className={listening ? 'ask-dot on' : 'ask-dot'} />
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
