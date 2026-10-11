// A repository's picker: what the CLI should open. Changes is `lens diff`, Pull request is
// `lens pr`; the command under the choices is the one the app runs.

import { useState } from 'react';
import { ArrowLeft, Folder, GitBranch } from 'lucide-react';
import { choiceCommand, choiceProblem, type ReviewChoice } from '../../../shared/choice.ts';
import { Button } from '../../../../src/render/web/client/ui/Button.tsx';
import { CopyCommand } from '../../../../src/render/web/client/ui/CopyCommand.tsx';
import { IconButton } from '../../../../src/render/web/client/ui/IconButton.tsx';
import { Kbd } from '../../../../src/render/web/client/ui/Kbd.tsx';
import { Segmented } from '../../../../src/render/web/client/ui/Segmented.tsx';
import '../../../../src/render/web/client/components/Header/style.css';
import { useApp } from '../../store.ts';
import { Changes } from './Changes.tsx';
import { PullRequest } from './PullRequest.tsx';
import { startingRange, type Mode, type Range } from './util.ts';
import './style.css';

const MODES: { value: Mode; label: string }[] = [
  { value: 'changes', label: 'Changes' },
  { value: 'pr', label: 'Pull request' },
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
  const problem = choiceProblem(choice);

  return (
    <>
      <header className='header picker-header'>
        <IconButton
          id='picker-back'
          label={current ? 'Back to the review' : 'Back to Start'}
          onClick={() => launcher.back()}
        >
          <ArrowLeft size={16} />
        </IconButton>
        <span className='brand'>
          lens<em>.</em>
        </span>
        <span className='header-divider' />
        <span className='repo-id'>
          <Folder size={15} />
          <span className='repo-name'>{repo.name}</span>
          <span className='repo-branch'>
            <GitBranch size={11} />
            {repo.branch ?? 'detached at ' + (repo.head ?? 'no commit')}
          </span>
          {/* a long path is cut: the whole of it is in the title */}
          <span className='repo-path' title={repo.root}>
            {repoPath}
          </span>
        </span>
      </header>
      <main className='screen'>
        <div className='column'>
          {/* outside the form: a button in a form submits it */}
          <div className='screen-head'>
            <h1>What do you want to review?</h1>
            <span className='spacer' />
            <Segmented id='picker-mode' label='What to review' options={MODES} value={mode} onChange={setMode} />
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
      <footer className='picker-foot'>
        <CopyCommand command={choiceCommand(choice)} />
        <span className='spacer' />
        {problem && <span className='picker-problem'>{problem}</span>}
        <Button id='open-review' variant='primary' type='submit' form='picker-form' disabled={busy || problem !== null}>
          Open review <Kbd combo='↵' />
        </Button>
      </footer>
    </>
  );
}
