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

/** A diff that ends at a commit names its whole hash: shown this long, the whole in its tooltip. */
const SHORT_SHA = 12;

/**
 * What to do instead of running the summary command: this diff ends at a branch that isn't checked
 * out, and a summary is written from the code on disk (`checkoutFirst` on the server). A branch
 * another worktree has can't be checked out here: it is reviewed there. Otherwise lens can make that
 * worktree (the desktop app then opens the review in it), or the reader checks it out.
 */
export function CheckoutFirst({ checkout }: { checkout: NonNullable<SummaryView['checkout']> }) {
  const { branch, worktree } = checkout;
  const making = useLens((state) => isBusy(state, 'worktree'));
  const sha = /^[0-9a-f]{40}$/.test(branch);
  return (
    <div data-part='checkout-first' className='flex flex-col gap-3'>
      <div>
        A summary is written from the checked-out code, and this diff ends at{' '}
        <Tag mono icon={<GitBranch size={11} />} className='align-middle' {...tipAttrs(sha && branch)}>
          {sha ? branch.slice(0, SHORT_SHA) : branch}
        </Tag>
        {worktree ? ', which is checked out in another worktree.' : ", which isn't checked out here."}
      </div>
      {worktree ? (
        <>
          <div className='flex min-w-0 items-center gap-3'>
            {/* the app opens it in a tab (it reads the line the server prints); a browser has only the command */}
            <Button
              data-part='checkout-worktree'
              size='sm'
              className='flex-none'
              disabled={making}
              onClick={() => void reviewInWorktree()}
              {...tipAttrs('Open it in a new tab (in the desktop app)')}
            >
              <ExternalLink size={13} />
              Review it there
            </Button>
            <span
              data-part='worktree-root'
              className='min-w-0 truncate font-mono text-sm text-faint'
              {...tipAttrs(worktree.root, { cut: true })}
            >
              {worktree.root}
            </span>
          </div>
          <div>
            <div className='text-sm text-muted'>Or run it there yourself:</div>
            <CopyCommand block wrap command={worktree.command} />
          </div>
        </>
      ) : (
        <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
          <Button data-part='review-worktree' size='sm' disabled={making} onClick={() => void reviewInWorktree()}>
            {making ? <Spinner size={13} /> : <FolderGit2 size={13} />}
            {making ? 'Making the worktree' : 'Review in a worktree'}
          </Button>
          <span className='text-sm text-muted'>or check it out:</span>
          <CopyCommand command={'git checkout ' + branch} />
        </div>
      )}
    </div>
  );
}
