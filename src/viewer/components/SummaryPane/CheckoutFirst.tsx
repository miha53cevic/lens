import { GitBranch } from 'lucide-react';
import type { SummaryView } from '../../../cli-app/summary/view.ts';
import { CopyCommand } from '../../../ui/CopyCommand.tsx';
import { Tag } from '../../../ui/Tag.tsx';

/**
 * What to do instead of running the summary command: this diff ends at a branch that isn't checked
 * out, and a summary is written from the code on disk (`checkoutFirst` on the server). A branch
 * another worktree has can't be checked out here: it is reviewed there.
 */
export function CheckoutFirst({ checkout }: { checkout: NonNullable<SummaryView['checkout']> }) {
  const { branch, worktree } = checkout;
  return (
    <>
      A summary is written from the checked-out code, and this diff ends at{' '}
      <Tag mono icon={<GitBranch size={11} />}>
        {branch}
      </Tag>
      {worktree ? (
        <>
          , which is checked out in{' '}
          <span data-part='checkout-worktree' className='font-mono'>
            {worktree.root}
          </span>
          . Review it there: <CopyCommand command={worktree.command} />
        </>
      ) : (
        <>
          . Check it out first: <CopyCommand command={'git checkout ' + branch} />
        </>
      )}
    </>
  );
}
