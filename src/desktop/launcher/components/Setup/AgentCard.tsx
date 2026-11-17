import clsx from 'clsx';
import { Check, Sparkles } from 'lucide-react';
import type { AgentInfo } from '../../../shared/api.ts';
import { agentNeedsYou } from '../../../shared/setup.ts';
import { CopyCommand } from '../../../../ui/CopyCommand.tsx';
import { ROW } from './const.ts';

const STATE_TEXT = { missing: 'Not installed', 'logged-out': 'Not logged in' };

/**
 * The agent lens runs itself (the `agent` pick): whether it can. Its words come from `lens info`; the
 * app knows no agent of its own. Nothing to click: installing and logging in are the agent's own steps.
 */
export function AgentCard({ agent }: { agent: AgentInfo }) {
  const needed = agentNeedsYou(agent);
  const ready = agent.problem === null;
  const found = [agent.path, agent.version].filter(Boolean).join(' · ');
  return (
    <li
      className={clsx(ROW, needed ? 'border-tone-line [--tone:var(--risk)]' : 'border-line')}
      id='setup-agent'
      data-state={agent.problem ?? 'ready'}
      data-needed={needed || undefined}
    >
      <Sparkles size={16} />
      <span className='grid min-w-0 gap-1'>
        <span className='flex items-center gap-2 leading-[1.4] font-semibold'>
          {ready && <span data-part='agent-dot' className='dot pulse [--dot:var(--add)]' />}
          {needed && <span className='dot [--dot:var(--risk)]' />}
          {agent.name}
        </span>
        <span className='text-sm leading-[1.55] [overflow-wrap:anywhere] text-muted [&_code]:text-text'>
          {agent.problem === 'missing'
            ? `Install ${agent.name} to use it as lens's agent.`
            : agent.problem === 'logged-out'
              ? 'Installed, but not logged in. Log in once in a terminal:'
              : agent.problem === 'unknown'
                ? `lens couldn't tell whether ${agent.name} is logged in.`
                : `lens runs ${agent.name} as its agent.`}
        </span>
        {agent.problem === 'logged-out' && agent.loginCommand && (
          <span className='w-fit'>
            <CopyCommand command={agent.loginCommand} />
          </span>
        )}
        {found && (
          <span className='mt-1 text-xs/[1.5] [overflow-wrap:anywhere] text-faint'>
            <code>{found}</code>
          </span>
        )}
      </span>
      <span className='flex items-center gap-3 self-center'>
        {ready && (
          <span className='inline-flex items-center gap-1 text-sm whitespace-nowrap text-add'>
            <Check size={13} />
            Ready
          </span>
        )}
        {(agent.problem === 'missing' || agent.problem === 'logged-out') && (
          <span data-part='setup-state' className='text-sm whitespace-nowrap text-risk'>
            {STATE_TEXT[agent.problem]}
          </span>
        )}
      </span>
    </li>
  );
}
