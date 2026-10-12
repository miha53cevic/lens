import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useLens } from '../../../store.ts';
import { realConcerns } from '../../../model/realConcerns.ts';
import { noteDone } from '../../../actions/status.ts';
import { plural } from '../../../shared.ts';
import { Button } from '../../../../ui/Button.tsx';

/**
 * The concerns the reader marked real, ready to hand to the agent: one click copies them, each
 * with its place in the code. Shown only while there is one. lens fixes nothing itself.
 */
export function RealConcerns() {
  const real = useLens((state) => realConcerns(state.data.summary!.units, state.concernMarks));
  const [copied, setCopied] = useState(false);
  // no clipboard (an insecure origin, a denied permission): the text itself, to select and copy
  const [shown, setShown] = useState(false);
  if (real.items.length === 0) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(real.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
      noteDone('Copied ' + plural(real.items.length, 'concern'), 'paste them to your agent');
    } catch {
      setShown(true);
    }
  };
  return (
    <div className='ov-real'>
      <div className='ov-real-row'>
        <span className='ov-real-count'>
          <b>{plural(real.items.length, 'confirmed concern')}</b> in {plural(real.unitCount, 'change')}
          {real.stale > 0 && <span className='stale-count'>{' · ' + real.stale + ' more on stale code'}</span>}
        </span>
        <Button size='sm' className='ov-real-copy' onClick={copy}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
          Copy for your agent
        </Button>
      </div>
      {shown && <pre className='ov-real-text'>{real.text}</pre>}
    </div>
  );
}
