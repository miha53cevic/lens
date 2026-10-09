// The Code view: the open file's code.

import { useCallback } from 'react';
import { useLens } from '../../store.ts';
import { activeFile } from '../../model/plans.ts';
import { FileCode } from './FileCode.tsx';
import { findUsages, restoreFileScroll, saveFileScroll } from './util.ts';

export function CodePane() {
  const { shown, path } = useLens((state) => {
    const shown = state.view === 'code';
    return { shown, path: shown ? (activeFile(state)?.file ?? null) : null };
  });
  // Every file shares this one scroll container. Keyed by the open file, it remounts on a
  // switch, and comes back where the reader left that file (scrollStore), even after a refresh.
  const restoreScroll = useCallback((pane: HTMLElement | null) => restoreFileScroll(pane, path), [path]);

  return (
    <main
      key={path ?? 'none'}
      ref={restoreScroll}
      style={shown ? undefined : { display: 'none' }}
      onScroll={(event) => saveFileScroll(event.currentTarget, path)}
    >
      <div className='code' id='code' onClick={findUsages}>
        {shown && <FileCode />}
      </div>
    </main>
  );
}
