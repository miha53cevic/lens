import { Folder, FolderOpen, X } from 'lucide-react';
import { Button } from '../../../ui/Button.tsx';
import { Kbd } from '../../../ui/Kbd.tsx';
import { IconButton } from '../../../ui/IconButton.tsx';
import { Brand } from '../../../ui/Brand.tsx';
import { useApp } from '../store.ts';
import { listRow } from '../../../ui/ListRow.tsx';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long ago `at` was, as a person says it: "just now", "5 min ago", "2h ago", "yesterday", "3 days ago". */
function ago(at: number, now: number): string {
  const since = Math.max(0, now - at);
  if (since < MINUTE) return 'just now';
  if (since < HOUR) return Math.floor(since / MINUTE) + ' min ago';
  if (since < DAY) return Math.floor(since / HOUR) + 'h ago';
  if (since < 2 * DAY) return 'yesterday';
  if (since < 30 * DAY) return Math.floor(since / DAY) + ' days ago';
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** The keys that open a repository: ⌘O on a Mac, Ctrl O elsewhere (main.tsx listens for both). */
function openKeys(platform: string): string {
  return platform === 'darwin' ? '⌘O' : 'Ctrl O';
}

/** What the app opens on: pick a repository, or one you opened before. */
export function Start() {
  const recents = useApp((state) => state.recents);
  const busy = useApp((state) => state.status.kind === 'working');
  const platform = useApp((state) => state.platform);
  const now = Date.now();
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
        {recents.length > 0 && (
          <section aria-label='Recent repositories'>
            <h2 className='mt-6 mb-2 px-2 eyebrow'>Recent</h2>
            <ul data-part='recents' className='m-0 grid list-none gap-1 p-0'>
              {recents.map((recent) => (
                <li
                  key={recent.root}
                  {...listRow(false, 'flex items-center focus-within:bg-hover-bg focus-within:text-text')}
                  data-part='recent'
                >
                  <button
                    data-part='recent-open'
                    className='flex min-w-0 flex-1 items-center gap-3 rounded-md px-3 py-2 text-left'
                    disabled={busy}
                    onClick={() => launcher.openRecent(recent.root)}
                  >
                    <Folder size={15} />
                    <span className='grid min-w-0'>
                      <span className='font-semibold text-text'>{recent.name}</span>
                      {/* a long path is cut: the whole of it is in the title */}
                      <span
                        className='overflow-hidden font-mono text-sm/[1.4] text-ellipsis whitespace-nowrap text-muted'
                        title={recent.path}
                      >
                        {recent.path}
                      </span>
                    </span>
                    {(recent.branch || recent.opened !== null) && (
                      <span className='ml-auto max-w-[40%] flex-none overflow-hidden text-xs text-ellipsis whitespace-nowrap text-faint'>
                        {[recent.branch, recent.opened !== null && ago(recent.opened, now)].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </button>
                  <IconButton
                    size='sm'
                    label={'Forget ' + recent.name}
                    className='mr-2'
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
