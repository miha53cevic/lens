import { ChevronsDownUp } from 'lucide-react';
import { collapseFolders } from '../../actions/tree.ts';
import { IconButton } from '../../../ui/IconButton.tsx';

/** The tree's title row, as VS Code's explorer has one: its actions show while the pointer is on the sidebar. */
export function ExplorerHeader() {
  return (
    <div data-part='explorer-head' className='mb-1 flex items-center gap-1'>
      <span className='eyebrow flex-1'>Changed files</span>
      <IconButton
        id='collapse-folders'
        size='sm'
        label='Collapse All'
        className='opacity-0 [transition:opacity_var(--motion)] group-hover/nav:opacity-100 focus-visible:opacity-100'
        onClick={collapseFolders}
      >
        <ChevronsDownUp size={14} />
      </IconButton>
    </div>
  );
}
