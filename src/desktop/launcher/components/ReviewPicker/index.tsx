// A repository's picker: what the CLI should open. Changes is `lens diff`, Pull request is
// `lens pr`; the command under the choices is the one the app runs.

import { useState } from 'react';
import { ArrowLeft, FileDiff, Folder, GitBranch, GitPullRequest } from 'lucide-react';
import { choiceCommand, choiceProblem, type ReviewChoice } from '../../../shared/choice.ts';
import { Button } from '../../../../ui/Button.tsx';
import { CopyCommand } from '../../../../ui/CopyCommand.tsx';
import { IconButton } from '../../../../ui/IconButton.tsx';
import { Kbd } from '../../../../ui/Kbd.tsx';
import { Segmented } from '../../../../ui/Segmented.tsx';
import { Tag } from '../../../../ui/Tag.tsx';
import { Brand } from '../../../../ui/Brand.tsx';
import { TopBar, TopBarDivider } from '../../../../ui/TopBar.tsx';
import { useApp } from '../../store.ts';
import { Changes } from './Changes.tsx';
import { PullRequest } from './PullRequest.tsx';
import { emptyRange, startingRange, type Mode, type Range } from './util.ts';

const MODES = [
  { value: 'changes' as Mode, label: 'Changes', icon: <FileDiff size={13} /> },
  { value: 'pr' as Mode, label: 'Pull request', icon: <GitPullRequest size={13} /> },
];

export function ReviewPicker() {
  const repo = useApp((state) => state.repo!);
  const repoPath = useApp((state) => state.repoPath);
  const current = useApp((state) => state.current);
  const busy = useApp((state) => state.status.kind === 'working');
  const { launcher } = window.lensApp;

  // the picker's own state: it starts on the review behind it, else on what there is to review
  const [mode, setMode] = useState<Mode>(current?.kind === 'pr' ? 'pr' : 'changes');
  const [range, setRange] = useState<Range>(() => startingRange(repo, current));
  const [base, setBase] = useState(
    current?.kind === 'diff' && current.range === 'branch' ? current.base : (repo.base ?? ''),
  );
  const [custom, setCustom] = useState(current?.kind === 'diff' && current.range === 'custom' ? current.args : '');
  const [pullRequest, setPullRequest] = useState(current?.kind === 'pr' ? current.ref : '');

  const choice: ReviewChoice =
    mode === 'pr'
      ? { kind: 'pr', ref: pullRequest }
      : range === 'branch'
        ? { kind: 'diff', range, base }
        : range === 'custom'
          ? { kind: 'diff', range, args: custom }
          : { kind: 'diff', range };
  const problem = choiceProblem(choice) ?? (mode === 'changes' ? emptyRange(repo, range, base) : null);

  return (
    <>
      <TopBar data-part='picker-header'>
        <IconButton
          id='picker-back'
          label={current ? 'Back to the review' : 'Back to Start'}
          onClick={() => launcher.back()}
        >
          <ArrowLeft size={16} />
        </IconButton>
        <Brand />
        <TopBarDivider />
        <span data-part='repo-id' className='flex min-w-0 items-center gap-2 [&>svg]:flex-none [&>svg]:text-muted'>
          <Folder size={15} />
          <span className='flex-none font-semibold'>{repo.name}</span>
          <Tag icon={<GitBranch size={11} />}>{repo.branch ?? 'detached at ' + (repo.head ?? 'no commit')}</Tag>
          {/* a long path is cut: the whole of it is in the title */}
          <span
            className='overflow-hidden font-mono text-sm text-ellipsis whitespace-nowrap text-faint'
            title={repo.root}
          >
            {repoPath}
          </span>
        </span>
      </TopBar>
      <main className='min-h-0 flex-1 overflow-y-auto motion:[transition:opacity_var(--motion-move)] motion:starting:opacity-0'>
        <div className='mx-auto w-full max-w-[660px] px-5 pb-7'>
          {/* outside the form: a button in a form submits it */}
          <div className='mt-6 mb-4 flex flex-wrap items-center gap-4'>
            <h1>What do you want to review?</h1>
            <span className='flex-1' />
            <Segmented
              id='picker-mode'
              label='What to review'
              size='lg'
              options={MODES}
              value={mode}
              onChange={setMode}
            />
          </div>
          <form
            id='picker-form'
            onSubmit={(event) => {
              event.preventDefault();
              if (!problem && !busy) launcher.open(choice);
            }}
          >
            {mode === 'changes' ? (
              <Changes
                repo={repo}
                range={range}
                onRange={setRange}
                base={base}
                onBase={(next) => {
                  setBase(next);
                  setRange('branch');
                  // the count of commits is against the base: ask for it against this one
                  launcher.setBase(next);
                }}
                custom={custom}
                onCustom={setCustom}
              />
            ) : (
              <PullRequest repo={repo} value={pullRequest} onChange={setPullRequest} />
            )}
          </form>
        </div>
      </main>
      <footer className='flex flex-none items-center gap-3 border-t border-line bg-bg px-4 py-3'>
        <CopyCommand command={choiceCommand(choice)} />
        <span className='flex-1' />
        {problem && (
          <span
            data-part='picker-problem'
            className='min-w-0 overflow-hidden text-sm text-ellipsis whitespace-nowrap text-muted'
          >
            {problem}
          </span>
        )}
        <Button id='open-review' variant='primary' type='submit' form='picker-form' disabled={busy || problem !== null}>
          Open review <Kbd combo='↵' />
        </Button>
      </footer>
    </>
  );
}
