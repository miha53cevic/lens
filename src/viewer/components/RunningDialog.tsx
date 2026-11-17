import { useLens } from '../store.ts';
import { DIALOG, ModalHead } from './ModalHead.tsx';
import { Button } from '../../ui/Button.tsx';
import { listRow } from '../../ui/ListRow.tsx';
import { agoText } from '../model/status.ts';
import { stopAgentRun } from '../actions/agentRuns.ts';

const KIND_LABEL = { summary: 'Summary', ask: 'Ask' };

/** The agent's runs going, each with its Stop: what lens started and the reader can end. */
export function RunningDialog() {
  const runs = useLens((state) => state.agentRuns);
  const activities = useLens((state) => state.activities);
  return (
    <dialog id='runs-modal' tabIndex={-1} className={DIALOG}>
      <ModalHead title='Running' />
      <div data-part='runs' className='overflow-auto p-2'>
        {runs.length === 0 && <p className='empty'>Nothing is running.</p>}
        {runs.map((run) => (
          <div
            key={run.id}
            data-run={run.id}
            {...listRow(false, 'grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-3 py-2')}
          >
            <span className='min-w-0'>
              <b className='block font-semibold text-text'>{KIND_LABEL[run.kind]}</b>
              <span className='block truncate text-xs text-faint'>{run.label}</span>
            </span>
            <span className='text-sm text-muted'>{agoText(Date.now() - run.startedAt)}</span>
            <Button
              data-part='run-stop'
              size='sm'
              disabled={activities.some((activity) => activity.id === 'stop-run-' + run.id)}
              onClick={() => void stopAgentRun(run.id)}
            >
              Stop
            </Button>
          </div>
        ))}
      </div>
    </dialog>
  );
}
