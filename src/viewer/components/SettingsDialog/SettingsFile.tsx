import { FolderOpen } from 'lucide-react';
import { useLens } from '../../store.ts';
import { isBusy } from '../../model/status.ts';
import { revealSettingsFile } from '../../actions/viewSettings.ts';
import { Button } from '../../../ui/Button.tsx';

/** Where the view settings are kept, the same for every repository; a click shows the file in Finder or Explorer. */
export function SettingsFile() {
  const { path, revealing } = useLens((state) => ({
    path: state.data.settingsFile,
    revealing: isBusy(state, 'reveal-settings'),
  }));
  return (
    <div className='flex min-w-0 items-center gap-2'>
      <span className='flex-none'>Applied as you change them, for every repository, in</span>
      <Button
        id='settings-file'
        variant='ghost'
        size='xs'
        className='min-w-0 font-mono text-text'
        title='Show it in Finder or Explorer'
        disabled={revealing}
        onClick={() => void revealSettingsFile()}
      >
        <FolderOpen size={13} className='flex-none' />
        <span className='min-w-0 overflow-hidden text-ellipsis'>{path}</span>
      </Button>
    </div>
  );
}
