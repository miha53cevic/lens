import { Check } from 'lucide-react';
import { useRef, useState } from 'react';
import { useLens } from '../../store.ts';
import { askContext, askFindings, askSelection } from '../../model/askContext.ts';
import { isBreak } from '../../model/signals.ts';
import { plural } from '../../shared.ts';
import { askSelLabel } from '../../ask/selection.ts';
import { waitingQuestion } from '../../model/status.ts';
import { askSend, growInput, setAsk } from '../../ask/rail.ts';
import { Button } from '../../../ui/Button.tsx';
import { Kbd } from '../../../ui/Kbd.tsx';

/** The question being written, with what goes along with it: the open change and the selection. */
export function Composer() {
  const [draft, setDraft] = useState('');
  /** A send or copy in flight */
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composer = useLens((state) => {
    const context = askContext(state);
    const selection = askSelection(state);
    const findings = askFindings(state);
    const breakCount = findings.filter(isBreak).length;
    return {
      contextLabel: context?.label ?? null,
      selectionLabel: selection ? askSelLabel(selection) : null,
      concernCount: findings.length - breakCount,
      breakCount,
      listening: state.ask.data.listening,
      waiting: !!waitingQuestion(state),
      error: state.ask.error,
    };
  });
  // one question at a time for the agent; with none listening, copying still works
  const blocked = !composer.contextLabel || !draft.trim() || (composer.listening && composer.waiting) || busy;

  const send = async () => {
    if (blocked) return;
    setBusy(true);
    const result = await askSend(draft);
    setBusy(false);
    if (result === 'sent') {
      setDraft('');
      if (inputRef.current) inputRef.current.style.height = ''; // back to its two rows
    } else if (result === 'copied') {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className='ask-composer'>
      <div className='ask-chips' id='ask-chips'>
        {composer.contextLabel && <span className='ask-chip unit'>{composer.contextLabel}</span>}
        {composer.contextLabel && composer.selectionLabel && (
          <span className='ask-chip'>{composer.selectionLabel}</span>
        )}
        {/* the unit's open concerns go along: the agent knows what "the risk here" is */}
        {composer.contextLabel && composer.concernCount > 0 && (
          <span className='ask-chip'>{plural(composer.concernCount, 'concern')}</span>
        )}
        {composer.contextLabel && composer.breakCount > 0 && (
          <span className='ask-chip'>{plural(composer.breakCount, 'possible break')}</span>
        )}
      </div>
      <textarea
        id='ask-input'
        ref={inputRef}
        rows={2}
        spellCheck={false}
        value={draft}
        disabled={!composer.contextLabel}
        placeholder={
          composer.contextLabel ? 'Ask about ' + composer.contextLabel + '…' : 'Open a change to ask about it'
        }
        onChange={(event) => {
          setDraft(event.target.value);
          if (composer.error) setAsk({ error: null }); // the reader typing: a failed send's message goes
          growInput(event.target);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            send();
          } else if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
            event.currentTarget.blur(); // back to the code: j/k and the view keys work again
          }
        }}
      />
      <div className='ask-row'>
        <span className={composer.error ? 'ask-hint error' : 'ask-hint'} id='ask-hint'>
          {composer.error || (
            <>
              <span>
                <Kbd combo='↵' /> {composer.listening ? 'ask' : 'copy'}
              </span>
              <span>
                <Kbd combo='⇧ ↵' /> newline
              </span>
              <span>
                <Kbd combo='Esc' /> leave
              </span>
            </>
          )}
        </span>
        <Button id='ask-send' variant='primary' disabled={blocked} onClick={send}>
          {copied ? (
            <>
              <Check size={13} /> Copied
            </>
          ) : composer.listening ? (
            'Ask'
          ) : (
            'Copy as prompt'
          )}
        </Button>
      </div>
    </div>
  );
}
