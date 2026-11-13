// The branch in the picker's header, and with more than one worktree a menu of them: picking one
// opens it in a tab of its own (or brings forward the tab that has it), next to this one.

import { useRef } from 'react';
import { ChevronDown, GitBranch } from 'lucide-react';
import type { RepoInfo, Worktree } from '../../../shared/api.ts';
import { MenuItem, MenuPanel, MenuSection, placeAt } from '../../../../ui/Menu.tsx';
import { Tag } from '../../../../ui/Tag.tsx';
import { useApp } from '../../store.ts';

const where = (worktree: Pick<Worktree, 'branch' | 'head'>) =>
  worktree.branch ?? 'detached at ' + (worktree.head ?? 'no commit');

export function Worktrees({ repo }: { repo: RepoInfo }) {
  const openTabs = useApp((state) => state.openTabs);
  const paths = useApp((state) => state.worktreePaths);
  const menuRef = useRef<HTMLDivElement>(null);
  if (repo.worktrees.length < 2) return <Tag icon={<GitBranch size={11} />}>{where(repo)}</Tag>;

  const open = () => {
    const menu = menuRef.current;
    const button = document.getElementById('worktrees');
    if (!menu || !button) return;
    menu.showPopover?.();
    // its top left corner under the tag: the header's left side has room, its right may not
    const rect = button.getBoundingClientRect();
    placeAt(menu, rect.left, rect.bottom + 6);
  };
  return (
    <>
      <Tag id='worktrees' icon={<GitBranch size={11} />} onClick={open} title='Worktrees of this repository'>
        {where(repo)}
        <ChevronDown size={11} />
      </Tag>
      <MenuPanel panelRef={menuRef} className='w-[380px]'>
        <MenuSection title={'Worktrees of ' + repo.main.split('/').at(-1)}>
          {repo.worktrees.map((worktree) => {
            const here = worktree.root === repo.root;
            const tab = openTabs[worktree.root];
            return (
              <MenuItem
                key={worktree.root}
                icon={<GitBranch size={13} className='flex-none text-muted' />}
                disabled={here || worktree.missing}
                onSelect={() => window.lensApp.launcher.openWorktree(worktree.root)}
              >
                <span data-part='worktree' data-root={worktree.root} className='flex min-w-0 items-center gap-3'>
                  <span className='grid min-w-0 flex-1'>
                    <span className='overflow-hidden font-semibold text-ellipsis whitespace-nowrap'>
                      {where(worktree)}
                    </span>
                    {/* a long path is cut: the whole of it is in the title */}
                    <span
                      className='overflow-hidden font-mono text-xs text-ellipsis whitespace-nowrap text-faint'
                      title={worktree.root}
                    >
                      {paths[worktree.root] ?? worktree.root}
                      {worktree.missing && ' · folder gone'}
                    </span>
                  </span>
                  <span data-part='worktree-tab' className='flex-none text-xs text-faint'>
                    {here ? 'this tab' : tab ? 'in tab ' + tab : ''}
                  </span>
                </span>
              </MenuItem>
            );
          })}
        </MenuSection>
      </MenuPanel>
    </>
  );
}
