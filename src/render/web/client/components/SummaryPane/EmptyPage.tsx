import { useState } from 'react';
import { useLens } from '../../store.ts';
import { showOverview } from '../../actions/summary.ts';
import { Button } from '../../ui/Button.tsx';

/** No summary yet: what to run in the agent, and a way to browse the changes anyway. */
export function EmptyPage() {
  const { command, cli, unitCount } = useLens((state) => ({
    command: state.data.summary?.command ?? '',
    cli: state.data.summary?.cli ?? '',
    unitCount: state.data.summary?.units.length ?? 0,
  }));
  const [copyLabel, setCopyLabel] = useState('copy');
  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopyLabel('copied');
    } catch {
      setCopyLabel('select + copy');
    }
  };

  return (
    <div className='sum-empty'>
      <h2>No summary yet</h2>
      <p>Your coding agent writes the summary. Run this in it:</p>
      <div className='cmd'>
        <span>{command}</span>
        <Button size='sm' id='copy-cmd' onClick={copyCommand}>
          {copyLabel}
        </Button>
      </div>
      <p>
        Without the skill, any agent with a shell can follow <code>{cli}</code>. When it's done, come back here: the
        Summary tab gets a dot, or press reload (r).
      </p>
      {/* the changes can be read without a summary: browsing starts on the overview */}
      <p>
        <Button variant='ghost' id='browse-units' onClick={showOverview}>
          Browse the {unitCount} changes without a summary
        </Button>
      </p>
    </div>
  );
}
