import { useLens } from '../../store.ts';
import { FileCode } from './FileCode.tsx';
import { hiddenStyle } from '../../shared.ts';
import './style.css';

export function CodePane() {
  const shown = useLens((state) => state.view === 'code');
  return (
    <main className='code-pane' style={hiddenStyle(!shown)}>
      {shown && <FileCode />}
    </main>
  );
}
