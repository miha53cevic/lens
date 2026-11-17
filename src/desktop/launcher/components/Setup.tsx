import type { ReactNode } from 'react';
import { Check, GitBranch, MessageSquare, Shapes, Terminal } from 'lucide-react';
import type { SetupItem, SetupPart } from '../../shared/api.ts';
import { Button } from '../../../ui/Button.tsx';
import { useApp } from '../store.ts';

interface SetupRowProps {
  part: SetupPart;
  icon: ReactNode;
  name: string;
  what: ReactNode;
  item: SetupItem;
  busy: boolean;
}

/** One thing the app can install for your agent, and take away again. */
function SetupRow({ part, icon, name, what, item, busy }: SetupRowProps) {
  const { launcher } = window.lensApp;
  return (
    <li
      className='grid grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-3 rounded-lg border border-line bg-surface p-4 [&>svg]:mt-0 [&>svg]:text-muted'
      id={'setup-' + part}
      data-state={item.state}
    >
      {icon}
      <span className='grid min-w-0 gap-1'>
        <span className='leading-[1.4] font-semibold'>{name}</span>
        <span className='text-sm leading-[1.55] [overflow-wrap:anywhere] text-muted [&_code]:text-text'>{what}</span>
        <span className='mt-1 text-xs/[1.5] [overflow-wrap:anywhere] text-faint'>
          <code>{item.where}</code>
          {item.note && ' · ' + item.note}
        </span>
      </span>
      <span className='flex items-center gap-3 self-center'>
        {item.state === 'missing' && (
          <Button variant='primary' disabled={busy} onClick={() => launcher.install(part)}>
            Install
          </Button>
        )}
        {item.state === 'installed' && (
          <>
            <span className='inline-flex items-center gap-1 text-sm whitespace-nowrap text-add'>
              <Check size={13} />
              Installed
            </span>
            <Button size='sm' disabled={busy} onClick={() => launcher.uninstall(part)}>
              Uninstall
            </Button>
          </>
        )}
        {item.state === 'external' && <span className='text-sm whitespace-nowrap text-muted'>Not the app's</span>}
      </span>
    </li>
  );
}

/** Setup, in a tab of its own: what your agent needs to work with lens, and the way to the sandbox. */
export function Setup() {
  const setup = useApp((state) => state.setup);
  const git = useApp((state) => state.git);
  const version = useApp((state) => state.version);
  const busy = useApp((state) => state.status.kind === 'working');
  return (
    <main
      data-part='setup'
      className='min-h-0 flex-1 overflow-y-auto motion:[transition:opacity_var(--motion-move)] motion:starting:opacity-0'
    >
      <div className='mx-auto w-full max-w-[660px] px-5 pb-7'>
        <div className='mt-6 mb-4 flex flex-wrap items-center gap-4 [&_h1]:m-0 [&_h1]:font-serif [&_h1]:text-xl/[1.2] [&_h1]:font-bold'>
          <h1>Setup</h1>
          <span className='flex-1' />
          <span data-part='setup-version' className='text-faint'>
            lens {version}
          </span>
        </div>
        <h2 className='mt-6 mb-2 px-2 eyebrow'>Agent</h2>
        <ul className='m-0 grid list-none gap-3 p-0'>
          <SetupRow
            part='cli'
            icon={<Terminal size={16} />}
            name='The lens command'
            what={
              <>
                Lets your agent, and you, run <code>lens</code> in a terminal. It runs this app's own copy of the CLI.
              </>
            }
            item={setup.cli}
            busy={busy}
          />
          <SetupRow
            part='skills'
            icon={<MessageSquare size={16} />}
            name='Agent skills'
            what={
              <>
                <code>/lens-review</code>, <code>/lens-build-review</code> and <code>/lens-ask</code>, copied into your
                agent's skills folder.
              </>
            }
            item={setup.skills}
            busy={busy}
          />
          <li
            className='grid grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-3 rounded-lg border border-line bg-surface p-4 [&>svg]:mt-0 [&>svg]:text-muted'
            id='setup-git'
          >
            <GitBranch size={16} />
            <span className='grid min-w-0 gap-1'>
              <span className='leading-[1.4] font-semibold'>git</span>
              <span className='text-sm leading-[1.55] [overflow-wrap:anywhere] text-muted [&_code]:text-text'>
                lens reads changes and pull requests through it.
              </span>
            </span>
            <span className='flex items-center gap-3 self-center'>
              {git ? (
                <span className='inline-flex items-center gap-1 text-sm whitespace-nowrap text-add'>
                  <Check size={13} />
                  {git}
                </span>
              ) : (
                <Button size='sm' onClick={() => window.lensApp.launcher.recheck()}>
                  Look again
                </Button>
              )}
            </span>
          </li>
        </ul>
        <p data-part='hint' className='mx-2 mt-4 mb-0 text-sm/[1.5] text-muted'>
          Uninstall removes only what the app installed. A <code>lens</code> command or a skill folder that came from
          somewhere else is never touched.
        </p>
        <h2 className='mt-6 mb-2 px-2 eyebrow'>Design system</h2>
        <ul className='m-0 grid list-none gap-3 p-0'>
          <li
            className='grid grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-3 rounded-lg border border-line bg-surface p-4 [&>svg]:mt-0 [&>svg]:text-muted'
            id='setup-sandbox'
          >
            <Shapes size={16} />
            <span className='grid min-w-0 gap-1'>
              <span className='leading-[1.4] font-semibold'>Sandbox</span>
              <span className='text-sm leading-[1.55] [overflow-wrap:anywhere] text-muted [&_code]:text-text'>
                Every control lens is built from, in each of its states. It follows the code theme.
              </span>
            </span>
            <span className='flex items-center gap-3 self-center'>
              <Button size='sm' onClick={() => window.lensApp.launcher.sandbox()}>
                Open
              </Button>
            </span>
          </li>
        </ul>
      </div>
    </main>
  );
}
