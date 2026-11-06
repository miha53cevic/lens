import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useLens, wholeData } from '../../../store.ts';
import { confirmedLabel, realConcerns } from '../../../model/realConcerns.ts';
import { copyForAgent } from '../../../actions/notes.ts';
import { plural } from '../../../shared.ts';
import { Button } from '../../../../ui/Button.tsx';

/**
 * The concerns and possible breaks the reader marked real, and the notes they wrote for the agent, ready to hand
 * over: one click copies them, each with its place in the code. Shown only while there is one, or a confirmed one
 * on code that changed since. lens fixes nothing itself.
 */
export function RealConcerns() {
  // of the whole change, whichever read is on: what the agent left untouched still goes along
  const real = useLens((state) => {
    const whole = wholeData(state);
    return realConcerns(whole.summary!.units, state.concernMarks, state.notes, whole.files);
  });
  const copied = useLens((state) => state.handoffCopied);
  // no clipboard (an insecure origin, a denied permission): the text itself, to select and copy
  const [shown, setShown] = useState(false);
  const count = real.items.length + real.notes.length;
  if (count === 0 && real.stale === 0) return null;

  const copy = async (button: HTMLElement) => {
    if (!(await copyForAgent(real, button))) setShown(true);
  };
  return (
    <div data-part='ov-real' className='rounded-md border border-line bg-surface px-4 py-3'>
      <div className='flex flex-wrap items-center justify-between gap-x-4 gap-y-2'>
        <span data-part='ov-real-count' className='min-w-0 text-muted [&_b]:text-text'>
          {count > 0 && <b>{confirmedLabel(real, 'confirmed ')}</b>}
          {/* the notes are on lines, not in changes: the count of changes is for confirmed findings alone */}
          {real.items.length > 0 && real.notes.length === 0 && <> in {plural(real.unitCount, 'change')}</>}
          {real.stale > 0 && (
            <span className='text-mod'>
              {(count > 0 ? ' · ' + real.stale + ' more' : plural(real.stale, 'confirmed finding')) +
                ' on code that changed since'}
            </span>
          )}
        </span>
        {count > 0 && (
          <Button
            size='sm'
            data-part='ov-real-copy'
            data-copied={copied ? '' : undefined}
            className={copied ? 'text-add' : undefined}
            onClick={(event) => void copy(event.currentTarget)}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy for your agent'}
          </Button>
        )}
      </div>
      {shown && (
        <pre className='mt-3 mb-0 font-mono text-sm/[1.6] [overflow-wrap:anywhere] whitespace-pre-wrap text-muted select-all'>
          {real.text}
        </pre>
      )}
    </div>
  );
}
