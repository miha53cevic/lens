import clsx from 'clsx';
import { Folder, GitBranch, X } from 'lucide-react';
import type { Recent } from '../../../shared/api.ts';
import { IconButton } from '../../../../ui/IconButton.tsx';
import { listRow } from '../../../../ui/ListRow.tsx';
import { useApp } from '../../store.ts';
import { ago, groupRecents } from './util.ts';

/** The folders opened before, a repository's linked worktrees under it. */
export function Recents() {
  const recents = useApp((state) => state.recents);
  if (recents.length === 0) return null;
  return (
    <section aria-label='Recent repositories'>
      <h2 className='mt-6 mb-2 px-2 eyebrow'>Recent</h2>
      <ul data-part='recents' className='m-0 grid list-none gap-1 p-0'>
        {groupRecents(recents).map((group) => (
          <li key={group.main} data-part='recent-group' className='grid gap-1'>
            {group.recent ? (
              <RecentRow recent={group.recent} />
            ) : (
              // only its linked worktrees were opened here: the repository names them, it isn't one to open
              <div data-part='recent-repo' className='flex items-center gap-3 px-3 py-2 font-semibold text-muted'>
                <Folder size={15} />
                {group.name}
              </div>
            )}
            {group.worktrees.length > 0 && (
              <ul className='m-0 ml-7 grid list-none gap-1 border-l border-line p-0 pl-2'>
                {group.worktrees.map((worktree) => (
                  <RecentRow key={worktree.root} recent={worktree} worktree />
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecentRow({ recent, worktree = false }: { recent: Recent; worktree?: boolean }) {
  const busy = useApp((state) => state.status.kind === 'working');
  const { launcher } = window.lensApp;
  const Row = worktree ? 'li' : 'div';
  // a worktree is named by its branch: its folder's name is often arbitrary
  const name = worktree ? (recent.branch ?? recent.name) : recent.name;
  const side = worktree
    ? recent.opened !== null && ago(recent.opened, Date.now())
    : [recent.branch, recent.opened !== null && ago(recent.opened, Date.now())].filter(Boolean).join(' · ');
  return (
    <Row
      {...listRow(false, 'flex items-center focus-within:bg-hover-bg focus-within:text-text')}
      data-part='recent'
      data-worktree={worktree ? '' : undefined}
    >
      <button
        data-part='recent-open'
        className={clsx('flex min-w-0 flex-1 items-center gap-3 rounded-md px-3 text-left', worktree ? 'py-1' : 'py-2')}
        disabled={busy}
        onClick={() => launcher.openRecent(recent.root)}
      >
        {worktree ? <GitBranch size={13} className='flex-none text-faint' /> : <Folder size={15} />}
        <span className='grid min-w-0'>
          <span className={clsx('text-text', worktree ? 'font-medium' : 'font-semibold')}>{name}</span>
          {/* a long path is cut: the whole of it is in the title */}
          <span
            className='overflow-hidden font-mono text-sm/[1.4] text-ellipsis whitespace-nowrap text-muted'
            title={recent.path}
          >
            {recent.path}
          </span>
        </span>
        {side && (
          <span className='ml-auto max-w-[40%] flex-none overflow-hidden text-xs text-ellipsis whitespace-nowrap text-faint'>
            {side}
          </span>
        )}
      </button>
      <IconButton
        size='sm'
        label={'Forget ' + name}
        className='mr-2'
        onClick={() => launcher.forgetRecent(recent.root)}
      >
        <X size={12} />
      </IconButton>
    </Row>
  );
}
