import { Keyboard, MoreHorizontal, Power, Settings, Trash2 } from 'lucide-react';
import { collapseAll, expandAll } from '../../actions/folds.ts';
import { openKeys, openSettings } from '../../actions/dialogs.ts';
import { endSession } from '../../actions/session.ts';
import { Menu, MenuItem, MenuSeparator } from '../../../ui/Menu.tsx';
import { openClearData } from '../../actions/clear.ts';

/**
 * ⋯: actions only. The settings (the code's size, folding, what the code shows, the summary's and the
 * tabs' switches) are in Settings; then the folds' two, then the two that remove something.
 */
export function MoreMenu() {
  return (
    <Menu id='more-btn' label='Settings and more' trigger={<MoreHorizontal size={17} />}>
      <MenuItem id='settings-btn' icon={<Settings size={14} />} shortcut=',' onSelect={() => openSettings()}>
        Settings
      </MenuItem>
      <MenuItem id='keys-btn' icon={<Keyboard size={14} />} shortcut='?' onSelect={() => openKeys()}>
        Keyboard shortcuts
      </MenuItem>
      <MenuSeparator />
      <MenuItem id='expand-all' shortcut='e' onSelect={expandAll}>
        Expand all
      </MenuItem>
      <MenuItem id='collapse-all' shortcut='c' onSelect={collapseAll}>
        Collapse all
      </MenuItem>
      <MenuSeparator />
      <MenuItem id='clear-data' danger icon={<Trash2 size={14} />} onSelect={openClearData}>
        Clear saved data…
      </MenuItem>
      <MenuItem id='end-session' danger icon={<Power size={14} />} onSelect={endSession}>
        End session
      </MenuItem>
    </Menu>
  );
}
