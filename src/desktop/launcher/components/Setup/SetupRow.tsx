import type { ReactNode } from 'react';
import clsx from 'clsx';
import { Check } from 'lucide-react';
import type { SetupItem, SetupPart } from '../../../shared/api.ts';
import { needsYou } from '../../../shared/setup.ts';
import { Button } from '../../../../ui/Button.tsx';
import { ROW } from './const.ts';

interface SetupRowProps {
  part: SetupPart;
  icon: ReactNode;
  name: string;
  what: ReactNode;
  item: SetupItem;
  busy: boolean;
}

/**
 * One thing the app can install for your agent, and take away again. One that needs you takes the
 * strip's dot and its color on its edge, so the dot there leads to it here.
 */
export function SetupRow({ part, icon, name, what, item, busy }: SetupRowProps) {
  const { launcher } = window.lensApp;
  const needed = needsYou(item);
  return (
    <li
      className={clsx(ROW, needed ? 'border-tone-line [--tone:var(--risk)]' : 'border-line')}
      id={'setup-' + part}
      data-state={item.state}
      data-needed={needed || undefined}
    >
      {icon}
      <span className='grid min-w-0 gap-1'>
        <span className='flex items-center gap-2 leading-[1.4] font-semibold'>
          {needed && <span className='dot [--dot:var(--risk)]' />}
          {name}
        </span>
        <span className='text-sm leading-[1.55] [overflow-wrap:anywhere] text-muted [&_code]:text-text'>{what}</span>
        <span className='mt-1 text-xs/[1.5] [overflow-wrap:anywhere] text-faint'>
          <code>{item.where}</code>
          {item.note && (
            <>
              {' · '}
              <span className={clsx(needed && 'text-risk')}>{item.note}</span>
            </>
          )}
        </span>
      </span>
      <span className='flex items-center gap-3 self-center'>
        {needed && (
          <>
            <span data-part='setup-state' className='text-sm whitespace-nowrap text-risk'>
              {item.state === 'stale' ? 'Out of date' : 'Not installed'}
            </span>
            <Button variant='primary' disabled={busy} onClick={() => launcher.install(part)}>
              {item.state === 'stale' ? 'Reinstall' : 'Install'}
            </Button>
          </>
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
