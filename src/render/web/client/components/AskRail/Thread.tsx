import { RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import type { AskQuestion } from '../../../../../ask/session.ts';
import { useLens } from '../../store.ts';
import { askGoto, askMarkdown, askOpenCite } from '../../ask/answers.ts';
import { askSelLabel } from '../../ask/selection.ts';
import { CopyCommand } from '../../ui/CopyCommand.tsx';

/** The questions and the agent's answers. A thread scrolled to its end follows new ones (askPoll). */
export function Thread() {
  const { questions, listening, files } = useLens((state) => ({
    questions: state.ask.data.questions,
    listening: state.ask.data.listening,
    files: state.data.files,
    // re-renders on each poll, so the wait times tick
    tick: state.ask.tick,
  }));

  return (
    <div
      className='ask-thread'
      id='ask-thread'
      onClick={(event) => {
        // cites live in the answers' markdown
        const cite = event.target instanceof Element ? event.target.closest<HTMLElement>('.ask-cite') : null;
        if (cite) askOpenCite(cite.dataset.file!, Number(cite.dataset.line));
      }}
    >
      {questions.length === 0 ? (
        <div className='ask-empty'>
          {listening ? (
            'Ask about the open change. Select code first to ask about those lines.'
          ) : (
            <>
              Run <CopyCommand command='/lens-ask' /> in your agent to get answers here. Until then,{' '}
              <b>Copy as prompt</b> puts your question and the code on the clipboard.
            </>
          )}
        </div>
      ) : (
        questions.map((question) => <QuestionAndAnswer key={question.id} question={question} files={files} />)
      )}
    </div>
  );
}

function QuestionAndAnswer({ question, files }: { question: AskQuestion; files: { file: string }[] }) {
  const answer = question.answer;
  return (
    <>
      <div className={clsx('ask-q', question.stale && 'stale')}>
        <div className='ask-chips'>
          <button className='ask-chip unit ask-goto' onClick={() => askGoto(question)}>
            {question.label}
          </button>
          {question.selection && <span className='ask-chip'>{askSelLabel(question.selection)}</span>}
        </div>
        <div className='ask-text'>{question.text}</div>
      </div>
      {answer ? (
        <div
          className={clsx('ask-a', question.stale && 'stale')}
          dangerouslySetInnerHTML={{
            __html:
              '<div class="ask-who">agent · ' +
              Math.max(1, Math.round((answer.at - question.askedAt) / 1000)) +
              's</div>' +
              askMarkdown(answer.markdown, question.stale ? [] : answer.cites, files),
          }}
        />
      ) : (
        <div className='ask-a'>
          <div className='ask-who ask-wait' data-asked={question.askedAt}>
            <span className='ask-spin' />
            {'waiting for agent · ' + Math.round((Date.now() - question.askedAt) / 1000) + 's'}
          </div>
        </div>
      )}
      {question.stale && (
        <div className='ask-stale'>
          <RefreshCw size={11} /> the code changed since this was asked
        </div>
      )}
    </>
  );
}
