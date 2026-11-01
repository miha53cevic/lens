import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useLens } from '../../../store.ts';
import { confirmedLabel, realConcerns } from '../../../model/realConcerns.ts';
import { noteDone } from '../../../actions/status.ts';
import { plural } from '../../../shared.ts';
import { Button } from '../../../../ui/Button.tsx';

/**
 * The concerns and possible breaks the reader marked real, and the notes they wrote for the agent, ready to hand
 * over: one click copies them, each with its place in the code. Shown only while there is one, or a confirmed one
 * on code that changed since. lens fixes nothing itself.
 */
export function RealConcerns() {
  const real = useLens((state) =>
    realConcerns(state.data.summary!.units, state.concernMarks, state.notes, state.data.files),
  );
  const [copied, setCopied] = useState(false);
  // no clipboard (an insecure origin, a denied permission): the text itself, to select and copy
  const [shown, setShown] = useState(false);
  const count = real.items.length + real.notes.length;
  if (count === 0 && real.stale === 0) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(real.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
      noteDone('Copied ' + confirmedLabel(real), 'paste them to your agent');
    } catch {
      setShown(true);
    }
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
          <Button size='sm' data-part='ov-real-copy' className='' onClick={copy}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            Copy for your agent
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
