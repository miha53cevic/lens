import clsx from 'clsx';
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
import { Tag } from '../../../ui/Tag.tsx';
import { TextArea } from '../../../ui/TextArea.tsx';

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
    <div className='flex flex-none flex-col gap-2 border-t border-line px-3 pt-2 pb-3'>
      <div className='flex flex-wrap gap-1 empty:hidden' id='ask-chips'>
        {composer.contextLabel && (
          <Tag className='' mono>
            {composer.contextLabel}
          </Tag>
        )}
        {composer.contextLabel && composer.selectionLabel && (
          <Tag className='' mono color='var(--question)'>
            {composer.selectionLabel}
          </Tag>
        )}
        {/* the unit's open concerns go along: the agent knows what "the risk here" is */}
        {composer.contextLabel && composer.concernCount > 0 && (
          <Tag className='' mono color='var(--question)'>
            {plural(composer.concernCount, 'concern')}
          </Tag>
        )}
        {composer.contextLabel && composer.breakCount > 0 && (
          <Tag className='' mono color='var(--question)'>
            {plural(composer.breakCount, 'possible break')}
          </Tag>
        )}
      </div>
      <TextArea
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
      <div className='flex items-center gap-2'>
        <span
          className={clsx(
            'flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-xs [&>span]:whitespace-nowrap',
            composer.error ? 'text-del' : 'text-muted',
          )}
          id='ask-hint'
        >
          {composer.error || (
            <>
              <span>
                <Kbd size='sm' combo='↵' /> {composer.listening ? 'ask' : 'copy'}
              </span>
              <span>
                <Kbd size='sm' combo='⇧ ↵' /> newline
              </span>
              <span>
                <Kbd size='sm' combo='Esc' /> leave
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
