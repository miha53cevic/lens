import { useLens } from '../../store.ts';
import { askContext, askSelection } from '../../model/askContext.ts';
import { askSelLabel } from '../../ask/selection.ts';
import { askSend, askSetDraft, askWaiting } from '../../ask/rail.ts';

/** The question being written, with what goes along with it: the open change and the selection. */
export function Composer() {
  const composer = useLens((state) => {
    const context = askContext(state);
    const selection = askSelection(state);
    const listening = state.ask.data.listening;
    return {
      contextLabel: context?.label ?? null,
      selectionLabel: selection ? askSelLabel(selection) : null,
      draft: state.ask.draft,
      listening,
      // one question at a time for the agent; with none listening, copying still works
      blocked: !context || !state.ask.draft.trim() || (listening && !!askWaiting(state)) || state.ask.busy,
      copied: state.ask.copied,
      error: state.ask.error,
    };
  });

  return (
    <div className='ask-composer'>
      <div className='ask-chips' id='ask-chips'>
        {composer.contextLabel && (
          <span className='ask-chip unit' title='the open change goes along with every question'>
            {composer.contextLabel}
          </span>
        )}
        {composer.contextLabel && composer.selectionLabel && (
          <span className='ask-chip' title='your selection in the code'>
            {composer.selectionLabel}
          </span>
        )}
      </div>
      <textarea
        id='ask-input'
        rows={2}
        spellCheck={false}
        value={composer.draft}
        disabled={!composer.contextLabel}
        placeholder={
          composer.contextLabel ? 'Ask about ' + composer.contextLabel + '…' : 'Open a change to ask about it'
        }
        onChange={(event) => askSetDraft(event.target.value, event.target)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (!composer.blocked) askSend();
          } else if (event.key === 'Escape') {
            event.currentTarget.blur(); // back to the code: j/k and the toolbar keys work again
          }
        }}
      />
      <div className='ask-row'>
        <span className={composer.error ? 'ask-hint error' : 'ask-hint'} id='ask-hint'>
          {composer.error || '↵ ask · ⇧↵ newline · Esc back to the code'}
        </span>
        <span className='spacer' />
        <button id='ask-send' disabled={composer.blocked} onClick={askSend}>
          {composer.copied ? 'Copied ✓' : composer.listening ? 'Ask' : 'Copy as prompt'}
        </button>
      </div>
    </div>
  );
}
