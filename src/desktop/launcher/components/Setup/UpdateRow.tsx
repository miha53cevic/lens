import clsx from 'clsx';
import { Check, RefreshCw } from 'lucide-react';
import type { LauncherState, UpdateState } from '../../../shared/api.ts';
import { INSTALL_COMMAND } from '../../../shared/release.ts';
import { Button } from '../../../../ui/Button.tsx';
import { CopyCommand } from '../../../../ui/CopyCommand.tsx';
import { Spinner } from '../../../../ui/Spinner.tsx';
import { ROW } from './const.ts';
import { ReleaseNotes } from './ReleaseNotes.tsx';

/** How much of the download is in, as the busy label says it; nothing while its size isn't known */
const percent = (progress: number | null) => (progress === null ? '' : ' ' + Math.round(progress * 100) + '%');

/**
 * The app's own update (main/update.ts). Nothing is checked until the reader asks; a newer release
 * takes the accent on its edge, shows its notes, and its button downloads it and restarts the app.
 * Otherwise the row has this version's notes, folded.
 */
export function UpdateRow({
  update,
  version,
  whatsNew,
}: {
  update: UpdateState;
  version: string;
  whatsNew: LauncherState['whatsNew'];
}) {
  const { launcher } = window.lensApp;
  const offered = update.kind === 'available';
  const name =
    update.kind === 'available'
      ? `lens ${update.version} is available`
      : update.kind === 'applying'
        ? `Updating to lens ${update.version}`
        : update.kind === 'current'
          ? 'Up to date'
          : update.kind === 'failed'
            ? update.label
            : `lens ${version}`;
  return (
    <li
      className={clsx(ROW, offered ? 'border-tone-line [--tone:var(--accent)]' : 'border-line')}
      id='setup-update'
      data-state={update.kind}
    >
      <RefreshCw size={16} />
      <span className='grid min-w-0 gap-1'>
        <span className='flex items-center gap-2 leading-[1.4] font-semibold'>
          {offered && <span className='dot [--dot:var(--accent)]' />}
          {name}
        </span>
        <span className='text-sm leading-[1.55] [overflow-wrap:anywhere] text-muted [&_code]:text-text'>
          {update.kind === 'source' ? (
            <>
              Running from a checkout: <code>git pull</code> updates it.
            </>
          ) : update.kind === 'unsupported' ? (
            "This build doesn't update itself: releases carry only the Apple silicon Mac app."
          ) : update.kind === 'current' ? (
            `lens ${version} is the latest release.`
          ) : update.kind === 'available' && !update.canApply ? (
            <>
              The app can't write to <code>{update.folder}</code>. Run this in a terminal to update it:
            </>
          ) : update.kind === 'available' || update.kind === 'applying' ? (
            'lens restarts and reopens your tabs as they were. An agent running in a review stops.'
          ) : update.kind === 'failed' ? (
            <span className='text-danger'>{update.detail}</span>
          ) : (
            'Looks for a newer release on GitHub when you ask, and nothing more.'
          )}
        </span>
        {update.kind === 'available' && !update.canApply && (
          <span className='w-fit max-w-full'>
            <CopyCommand command={INSTALL_COMMAND} />
          </span>
        )}
        {update.kind === 'available' && update.notes && (
          <ReleaseNotes key={update.version} version={update.version} notes={update.notes} open />
        )}
        {update.kind !== 'available' && update.kind !== 'applying' && whatsNew && (
          <ReleaseNotes version={whatsNew.version} notes={whatsNew.notes} open={false} />
        )}
      </span>
      <span className='flex items-center gap-3 self-center'>
        {update.kind === 'current' && (
          <span className='inline-flex items-center gap-1 text-sm whitespace-nowrap text-add'>
            <Check size={13} />
            Latest
          </span>
        )}
        {(update.kind === 'checking' || update.kind === 'applying') && (
          <span data-part='update-busy' className='inline-flex items-center gap-2 text-sm whitespace-nowrap text-muted'>
            <Spinner />
            {update.kind === 'checking' ? 'Checking…' : 'Downloading…' + percent(update.progress)}
          </span>
        )}
        {(update.kind === 'idle' || update.kind === 'current' || update.kind === 'failed') && (
          <Button size='sm' onClick={() => launcher.checkUpdate()}>
            {update.kind === 'idle' ? 'Check for updates' : 'Check again'}
          </Button>
        )}
        {update.kind === 'available' && update.canApply && (
          <Button variant='primary' onClick={() => launcher.applyUpdate()}>
            Update and restart
          </Button>
        )}
      </span>
    </li>
  );
}
