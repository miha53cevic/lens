import { Copy, Link, MessageSquare, NotebookPen } from 'lucide-react';
import { MenuItem, MenuPanel, MenuSeparator } from '../../ui/Menu.tsx';
import { askOpenAndFocus } from '../ask/rail.ts';
import { startNote } from '../actions/notes.ts';
import { CODE_MENU, copySelectedLines, copySelectedPlace } from '../actions/codeMenu.ts';

/**
 * The code's right-click menu (actions/codeMenu.ts), on the lines it was opened on. It takes the
 * browser's place there, so it carries the copy items the browser's would.
 */
export function CodeMenu() {
  return (
    <MenuPanel id={CODE_MENU} className='w-[240px] origin-top-left'>
      <MenuItem id='code-menu-ask' icon={<MessageSquare size={14} />} shortcut='a' onSelect={askOpenAndFocus}>
        Ask about these lines
      </MenuItem>
      <MenuItem id='code-menu-note' icon={<NotebookPen size={14} />} onSelect={startNote}>
        Add a note
      </MenuItem>
      <MenuSeparator />
      <MenuItem id='code-menu-copy' icon={<Copy size={14} />} onSelect={() => void copySelectedLines()}>
        Copy lines
      </MenuItem>
      <MenuItem id='code-menu-place' icon={<Link size={14} />} onSelect={() => void copySelectedPlace()}>
        Copy file:line
      </MenuItem>
    </MenuPanel>
  );
}
