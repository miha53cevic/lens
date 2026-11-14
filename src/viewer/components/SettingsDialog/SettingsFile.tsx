import { FolderOpen } from 'lucide-react';
import { useLens } from '../../store.ts';
import { isBusy } from '../../model/status.ts';
import { revealSettingsFile } from '../../actions/viewSettings.ts';
import { Button } from '../../../ui/Button.tsx';
import { tipAttrs } from '../../../ui/Tip.tsx';

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
        // a long home folder is cut, never the line: the whole path is in the tooltip
        className='max-w-[360px] min-w-0 flex-initial font-mono text-text'
        {...tipAttrs(path, { cut: true })}
        disabled={revealing}
        onClick={() => void revealSettingsFile()}
      >
        <FolderOpen size={13} className='flex-none' />
        <span className='min-w-0 overflow-hidden text-ellipsis'>{path}</span>
      </Button>
    </div>
  );
}
