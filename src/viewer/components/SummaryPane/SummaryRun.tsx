import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '../../../ui/Button.tsx';
import { CopyCommand } from '../../../ui/CopyCommand.tsx';
import { Spinner } from '../../../ui/Spinner.tsx';
import { useLens } from '../../store.ts';
import { isBusy } from '../../model/status.ts';
import { runAgentSummary } from '../../actions/summary.ts';

interface SummaryRunProps {
  command: string;
  /** How the command reads in its sentence, with no agent picked: the reader's own agent runs it */
  children: (command: ReactNode) => ReactNode;
  /** The command on its own row (the empty Summary page) */
  block?: boolean;
}

/**
 * What gets the summary written. With an agent picked, a button that has lens run it (the
 * server's); otherwise the command to run in your agent, in its sentence.
 */
export function SummaryRun({ command, children, block }: SummaryRunProps) {
  const { on, running } = useLens((state) => ({
    on: state.data.agent !== null,
    running: !!state.agentRun?.running || isBusy(state, 'agent-summary'),
  }));
  if (!on) return children(<CopyCommand command={command} block={block} />);
  return (
    <Button
      data-part='agent-run'
      data-running={running || undefined}
      size='sm'
      className={block ? 'my-3' : 'align-middle'}
      disabled={running}
      onClick={() => void runAgentSummary()}
    >
      {running ? <Spinner size={13} /> : <Sparkles size={13} />}
      {running ? 'Agent is writing it' : 'Write with agent'}
    </Button>
  );
}
