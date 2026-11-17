import { ExternalLink, FolderGit2, GitBranch } from 'lucide-react';
import type { SummaryView } from '../../../cli-app/summary/view.ts';
import { Button } from '../../../ui/Button.tsx';
import { CopyCommand } from '../../../ui/CopyCommand.tsx';
import { Spinner } from '../../../ui/Spinner.tsx';
import { Tag } from '../../../ui/Tag.tsx';
import { tipAttrs } from '../../../ui/Tip.tsx';
import { useLens } from '../../store.ts';
import { isBusy } from '../../model/status.ts';
import { reviewInWorktree } from '../../actions/summary.ts';

/**
 * What to do instead of running the summary command: this diff ends at a branch that isn't checked
 * out, and a summary is written from the code on disk (`checkoutFirst` on the server). A branch
 * another worktree has can't be checked out here: it is reviewed there. Otherwise lens can make that
 * worktree (the desktop app then opens the review in it), or the reader checks it out.
 */
export function CheckoutFirst({ checkout }: { checkout: NonNullable<SummaryView['checkout']> }) {
  const { branch, worktree } = checkout;
  const making = useLens((state) => isBusy(state, 'worktree'));
  return (
    <>
      A summary is written from the checked-out code, and this diff ends at{' '}
      <Tag mono icon={<GitBranch size={11} />}>
        {branch}
      </Tag>
      {worktree ? (
        <>
          , which is checked out in{' '}
          {/* the app opens it in a tab (it reads the line the server prints); a browser has only the command */}
          <Button
            data-part='checkout-worktree'
            variant='ghost'
            size='sm'
            className='align-middle font-mono'
            disabled={making}
            onClick={() => void reviewInWorktree()}
            {...tipAttrs('Open it in a new tab (in the desktop app)')}
          >
            {worktree.root}
            <ExternalLink size={12} />
          </Button>
          . Review it there: <CopyCommand command={worktree.command} />
        </>
      ) : (
        <>
          .{' '}
          <Button
            data-part='review-worktree'
            size='sm'
            className='align-middle'
            disabled={making}
            onClick={() => void reviewInWorktree()}
          >
            {making ? <Spinner size={13} /> : <FolderGit2 size={13} />}
            {making ? 'Making the worktree' : 'Review in a worktree'}
          </Button>{' '}
          or check it out: <CopyCommand command={'git checkout ' + branch} />
        </>
      )}
    </>
  );
}
