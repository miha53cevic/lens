import { useLens } from '../../store.ts';
import { FileCode } from './FileCode.tsx';
import { hiddenStyle } from '../../shared.ts';

export function CodePane() {
  const shown = useLens((state) => state.view === 'code');
  return (
    <main
      data-part='code-pane'
      className='flex min-h-0 min-w-0 flex-1 flex-col bg-bg [&_[data-part=ruler]]:pb-[64px]'
      style={hiddenStyle(!shown)}
    >
      {shown && <FileCode />}
    </main>
  );
}
