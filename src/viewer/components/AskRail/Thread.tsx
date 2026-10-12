import { RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import type { AskQuestion } from '../../../cli-app/ask/session.ts';
import { useLens } from '../../store.ts';
import { askGoto, askMarkdown, askOpenCite } from '../../ask/answers.ts';
import { askSelLabel } from '../../ask/selection.ts';
import { CopyCommand } from '../../../ui/CopyCommand.tsx';
import { Skeleton } from '../../../ui/Skeleton.tsx';

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
        questions.map((question) => (
          <QuestionAndAnswer key={question.id} question={question} listening={listening} files={files} />
        ))
      )}
    </div>
  );
}

interface QuestionAndAnswerProps {
  question: AskQuestion;
  /** An agent is there to answer it */
  listening: boolean;
  files: { file: string }[];
}

function QuestionAndAnswer({ question, listening, files }: QuestionAndAnswerProps) {
  const answer = question.answer;
  return (
    <>
      <div className={clsx('ask-q', question.stale && 'stale')}>
        <div className='ask-chips'>
          <button className='ask-chip unit' onClick={() => askGoto(question)}>
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
      ) : !listening ? (
        // nobody will answer it: no spinner and no wait time, only what to run
        <div className='ask-a ask-noagent'>
          No agent is listening. Run <CopyCommand command='/lens-ask' /> in your agent to get this answered.
        </div>
      ) : (
        <div className='ask-a'>
          <div className='ask-who ask-wait'>
            <span className='ask-spin spin' />
            {'waiting for agent · ' + Math.round((Date.now() - question.askedAt) / 1000) + 's'}
          </div>
          {/* where the answer will be: only here, where an agent is known to be writing one */}
          <div className='ask-lines'>
            <Skeleton />
            <Skeleton width='92%' />
            <Skeleton width='58%' />
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
