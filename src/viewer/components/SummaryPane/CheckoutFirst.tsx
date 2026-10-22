import { GitBranch } from 'lucide-react';
import { CopyCommand } from '../../../ui/CopyCommand.tsx';
import { Tag } from '../../../ui/Tag.tsx';

/**
 * What to do instead of running the summary command: this diff ends at a branch that isn't checked
 * out, and a summary is written from the code on disk (`checkoutFirst` on the server).
 */
export function CheckoutFirst({ branch }: { branch: string }) {
  return (
    <>
      A summary is written from the checked-out code, and this diff ends at{' '}
      <Tag mono icon={<GitBranch size={11} />}>
        {branch}
      </Tag>
      . Check it out first: <CopyCommand command={'git checkout ' + branch} />
    </>
  );
}
