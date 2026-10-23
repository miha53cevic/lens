import { Folder, FolderOpen, X } from 'lucide-react';
import { Button } from '../../../ui/Button.tsx';
import { IconButton } from '../../../ui/IconButton.tsx';
import { Brand } from '../../../ui/Brand.tsx';
import { useApp } from '../store.ts';
import { listRowClass } from '../../../ui/ListRow.tsx';
import './Start.css';

/** What the app opens on: pick a repository, or one you opened before. */
export function Start() {
  const recents = useApp((state) => state.recents);
  const busy = useApp((state) => state.status.kind === 'working');
  const { launcher } = window.lensApp;
  return (
    <main className='screen start'>
      <div className='column'>
        <div className='start-hero'>
          <Brand as='h1' className='start-brand' />
          <p className='start-tagline'>Code review for the agentic era.</p>
          <Button id='open-repository' variant='primary' disabled={busy} onClick={() => launcher.openRepository()}>
            <FolderOpen size={15} />
            Open repository
          </Button>
        </div>
        {recents.length > 0 && (
          <section aria-label='Recent repositories'>
            <h2 className='section-title eyebrow'>Recent</h2>
            <ul className='recents'>
              {recents.map((recent) => (
                <li key={recent.root} className={listRowClass(false, 'recent')}>
                  <button className='recent-open' disabled={busy} onClick={() => launcher.openRecent(recent.root)}>
                    <Folder size={15} />
                    <span className='recent-text'>
                      <span className='recent-name'>{recent.name}</span>
                      {/* a long path is cut: the whole of it is in the title */}
                      <span className='recent-path' title={recent.path}>
                        {recent.path}
                      </span>
                    </span>
                  </button>
                  <IconButton
                    size='sm'
                    label={'Forget ' + recent.name}
                    className='recent-forget'
                    onClick={() => launcher.forgetRecent(recent.root)}
                  >
                    <X size={12} />
                  </IconButton>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
