import { FolderOpen } from 'lucide-react';
import { Button } from '../../../../ui/Button.tsx';
import { Kbd } from '../../../../ui/Kbd.tsx';
import { Brand } from '../../../../ui/Brand.tsx';
import { useApp } from '../../store.ts';
import { Recents } from './Recents.tsx';
import { openKeys } from './util.ts';

/** What the app opens on: pick a repository, or one you opened before. */
export function Start() {
  const busy = useApp((state) => state.status.kind === 'working');
  const platform = useApp((state) => state.platform);
  const { launcher } = window.lensApp;
  return (
    <main
      data-part='start'
      className='min-h-0 flex-1 overflow-y-auto motion:[transition:opacity_var(--motion-move)] motion:starting:opacity-0'
    >
      <div className='mx-auto w-full max-w-[660px] px-5 pb-7'>
        <div className='mt-[calc(var(--screen-h)*0.09)] text-center'>
          <Brand as='h1' className='m-0 text-3xl' />
          <p data-part='start-tagline' className='mt-2 mb-4 text-muted'>
            Code review for the agentic era.
          </p>
          <Button id='open-repository' variant='primary' disabled={busy} onClick={() => launcher.openRepository()}>
            <FolderOpen size={15} />
            Open repository <Kbd combo={openKeys(platform)} />
          </Button>
        </div>
        <Recents />
      </div>
    </main>
  );
}
