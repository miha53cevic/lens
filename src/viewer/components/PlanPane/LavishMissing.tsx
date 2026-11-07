import type { LavishSetup } from '../../../cli-app/api/contract.ts';
import { LAVISH_INSTALL, LAVISH_REPO } from '../../../cli-app/plan/links.ts';
import { CopyCommand } from '../../../ui/CopyCommand.tsx';
import { Tag } from '../../../ui/Tag.tsx';

/** What lens checks (cli-app/plan/lavish.ts), each found or not, and how to put it right. */
export function LavishMissing({ setup }: { setup: LavishSetup }) {
  const nodeOk = setup.node !== null && Number(setup.node.split('.')[0]) >= setup.nodeNeeded;
  const checks = [
    {
      id: 'skill',
      ok: setup.skill !== null,
      what: 'The Lavish skill',
      detail: setup.skill ?? 'in .claude/skills/, ~/.claude/skills/ or ~/.agents/skills/',
    },
    {
      id: 'node',
      ok: nodeOk,
      what: `Node ${setup.nodeNeeded} or newer`,
      detail: setup.node ? 'found ' + setup.node : 'none found',
    },
    {
      id: 'cli',
      ok: setup.cli !== null,
      what: 'npx or lavish-axi',
      detail: setup.cli ?? (nodeOk ? 'none found' : 'needs the node above'),
    },
  ];

  return (
    <div data-part='lavish-missing' className='mx-auto mt-7 flex w-full max-w-[560px] flex-col gap-4 px-6'>
      <h2 className='text-xl font-semibold'>Plans need Lavish</h2>
      <p className='leading-[1.6] text-muted'>
        The Plan tab shows the plans your agent makes with Lavish, where you annotate them, answer their questions and
        press Build it. Set it up once: this tab notices on its own.
      </p>
      <ul className='flex flex-col gap-2'>
        {checks.map((check) => (
          <li
            key={check.id}
            data-part='lavish-check'
            data-check={check.id}
            data-ok={check.ok || undefined}
            className='flex items-center gap-2'
          >
            {/* missing is what needs the reader: the warning's color, as the status bar's; found stays neutral */}
            <Tag color={check.ok ? undefined : 'var(--risk)'}>{check.ok ? 'found' : 'missing'}</Tag>
            <span>{check.what}</span>
            <span className='min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-muted' title={check.detail}>
              {check.detail}
            </span>
          </li>
        ))}
      </ul>
      {!setup.skill && (
        <div>
          Install the skill in your agent:
          <CopyCommand block command={LAVISH_INSTALL} />
        </div>
      )}
      <p className='text-muted'>
        Lavish is{' '}
        <a
          id='lavish-repo'
          className='text-accent underline-offset-2 hover:underline'
          href={LAVISH_REPO}
          target='_blank'
          rel='noreferrer'
        >
          kunchenguid/lavish-axi
        </a>{' '}
        on GitHub.
      </p>
    </div>
  );
}
