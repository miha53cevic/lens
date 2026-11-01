import { RefreshCw } from 'lucide-react';
import type { AskQuestion } from '../../../cli-app/ask/session.ts';
import { useLens } from '../../store.ts';
import { askGoto, askOpenCite } from '../../ask/answers.ts';
import { askMarkdown } from '../../ask/markdown.ts';
import { askSelLabel } from '../../ask/selection.ts';
import { CopyCommand } from '../../../ui/CopyCommand.tsx';
import { Skeleton } from '../../../ui/Skeleton.tsx';
import { Spinner } from '../../../ui/Spinner.tsx';
import { Tag } from '../../../ui/Tag.tsx';
import { fadeIn, riseIn } from '../../../ui/motion.ts';

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
      className='flex flex-1 flex-col gap-3 overflow-y-auto p-4'
      id='ask-thread'
      onClick={(event) => {
        // cites live in the answers' markdown
        const cite = event.target instanceof Element ? event.target.closest<HTMLElement>('.ask-cite') : null;
        if (cite) askOpenCite(cite.dataset.file!, Number(cite.dataset.line));
      }}
    >
      {questions.length === 0 ? (
        <div data-part='ask-empty' className='leading-[1.55] text-muted'>
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
      <div
        ref={riseIn}
        data-part='ask-q'
        data-stale={question.stale || undefined}
        className='flex max-w-[92%] flex-col gap-2 self-end rounded-[var(--radius-lg)_var(--radius-lg)_var(--radius-xs)_var(--radius-lg)] border border-line bg-surface px-3 py-2 data-stale:opacity-55'
      >
        <div className='flex flex-wrap gap-1 empty:hidden'>
          <Tag className='' mono onClick={() => askGoto(question)}>
            {question.label}
          </Tag>
          {question.selection && (
            <Tag className='' mono color='var(--question)'>
              {askSelLabel(question.selection)}
            </Tag>
          )}
        </div>
        <div className='[overflow-wrap:anywhere] whitespace-pre-wrap'>{question.text}</div>
      </div>
      {/* keyed, so the answer is a new element: it fades in over where its placeholder was */}
      {answer ? (
        <div
          key='answer'
          ref={fadeIn}
          data-part='ask-a'
          data-stale={question.stale || undefined}
          className='answer data-stale:opacity-55'
          dangerouslySetInnerHTML={{
            __html:
              '<div class="mb-0 flex items-center gap-2 text-xs text-faint">agent · ' +
              Math.max(1, Math.round((answer.at - question.askedAt) / 1000)) +
              's</div>' +
              askMarkdown(answer.markdown, question.stale ? [] : answer.cites, files),
          }}
        />
      ) : !listening ? (
        // nobody will answer it: no spinner and no wait time, only what to run
        <div key='no-agent' data-part='ask-noagent' className='answer leading-[1.55] text-muted'>
          No agent is listening. Run <CopyCommand command='/lens-ask' /> in your agent to get this answered.
        </div>
      ) : (
        <div key='waiting' ref={riseIn} data-part='ask-a' className='answer'>
          <div
            data-part='ask-wait'
            className='mb-0 flex items-center gap-2 text-xs text-faint [&_.spin]:flex-none [&_.spin]:text-accent'
          >
            <Spinner size={11} />
            {'waiting for agent · ' + Math.round((Date.now() - question.askedAt) / 1000) + 's'}
          </div>
          {/* where the answer will be: only here, where an agent is known to be writing one */}
          <div data-part='ask-lines' className='mt-2 grid [&_.skeleton]:my-[0.45em]'>
            <Skeleton />
            <Skeleton width='92%' />
            <Skeleton width='58%' />
          </div>
        </div>
      )}
      {question.stale && (
        <div className='flex items-center gap-1 border-t border-dashed border-line pt-1 text-xs text-muted'>
          <RefreshCw size={11} /> the code changed since this was asked
        </div>
      )}
    </>
  );
}
