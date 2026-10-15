import type { ReactNode } from 'react';
import { Check, GitBranch, MessageSquare, Shapes, Terminal } from 'lucide-react';
import type { SetupItem, SetupPart } from '../../shared/api.ts';
import { Button } from '../../../ui/Button.tsx';
import { useApp } from '../store.ts';
import './Settings.css';

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
    <li className='setup-item' id={'setup-' + part} data-state={item.state}>
      {icon}
      <span className='setup-text'>
        <span className='setup-name'>{name}</span>
        <span className='setup-sub'>{what}</span>
        <span className='setup-where'>
          <code>{item.where}</code>
          {item.note && ' · ' + item.note}
        </span>
      </span>
      <span className='setup-actions'>
        {item.state === 'missing' && (
          <Button variant='primary' disabled={busy} onClick={() => launcher.install(part)}>
            Install
          </Button>
        )}
        {item.state === 'installed' && (
          <>
            <span className='setup-ok'>
              <Check size={13} />
              Installed
            </span>
            <Button size='sm' disabled={busy} onClick={() => launcher.uninstall(part)}>
              Uninstall
            </Button>
          </>
        )}
        {item.state === 'external' && <span className='setup-external'>Not the app's</span>}
      </span>
    </li>
  );
}

/** Settings, in a tab of its own: what your agent needs to work with lens, and the way to the sandbox. */
export function Settings() {
  const setup = useApp((state) => state.setup);
  const git = useApp((state) => state.git);
  const version = useApp((state) => state.version);
  const busy = useApp((state) => state.status.kind === 'working');
  return (
    <main className='screen settings'>
      <div className='column'>
        <div className='screen-head'>
          <h1>Settings</h1>
          <span className='spacer' />
          <span className='settings-version'>lens {version}</span>
        </div>
        <h2 className='section-title'>Agent</h2>
        <ul className='setup'>
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
          <li className='setup-item' id='setup-git'>
            <GitBranch size={16} />
            <span className='setup-text'>
              <span className='setup-name'>git</span>
              <span className='setup-sub'>lens reads changes and pull requests through it.</span>
            </span>
            <span className='setup-actions'>
              {git ? (
                <span className='setup-ok'>
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
        <p className='hint'>
          Uninstall removes only what the app installed. A <code>lens</code> command or a skill folder that came from
          somewhere else, such as a checkout's <code>bun run install-skill</code>, is never touched.
        </p>
        <h2 className='section-title'>Design system</h2>
        <ul className='setup'>
          <li className='setup-item' id='setup-sandbox'>
            <Shapes size={16} />
            <span className='setup-text'>
              <span className='setup-name'>Sandbox</span>
              <span className='setup-sub'>
                Every control lens is built from, in each of its states. It follows the code theme.
              </span>
            </span>
            <span className='setup-actions'>
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
