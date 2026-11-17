import type { KeyboardEvent } from 'react';
import { COMMIT_COUNTS, type CommitCount, type RepoInfo } from '../../../shared/api.ts';
import { shortSha } from '../../../shared/choice.ts';
import { plural } from '../../../../cli-app/text.ts';
import { Button } from '../../../../ui/Button.tsx';
import { Kbd } from '../../../../ui/Kbd.tsx';
import { Select } from '../../../../ui/Select.tsx';
import { listRow } from '../../../../ui/ListRow.tsx';
import { Tag } from '../../../../ui/Tag.tsx';
import { tipAttrs } from '../../../../ui/Tip.tsx';
import { useApp } from '../../store.ts';
import { ago } from '../Start/util.ts';
import { runRows, type Run } from './util.ts';

interface CommitsProps {
  repo: RepoInfo;
  run: Run | null;
  onRun: (run: Run | null) => void;
}

/** HEAD's last commits, to pick one or a run: click, ⇧ click to reach another; ↑↓ move, ⇧↑↓ extend. */
export function Commits({ repo, run, onRun }: CommitsProps) {
  const { commits } = repo;
  const commitCount = useApp((state) => state.commitCount);
  const rows = runRows(repo, run);
  const now = Date.now();

  const pick = (index: number, extend: boolean) => {
    const sha = commits[index].sha;
    onRun(extend && run && rows ? { anchor: run.anchor, end: sha } : { anchor: sha, end: sha });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const at = rows ? commits.findIndex((commit) => commit.sha === run!.end) : -1;
    const step = event.key === 'ArrowDown' ? 1 : -1;
    pick(Math.min(commits.length - 1, Math.max(0, at === -1 ? 0 : at + step)), event.shiftKey);
  };

  return (
    <div data-part='commits' className='overflow-hidden rounded-md border border-line bg-surface'>
      <div
        data-part='commits-bar'
        className='flex min-h-control items-center gap-2 border-b border-line px-3 py-1 text-sm text-muted'
        {...tipAttrs('↑↓ move, ⇧↑↓ extend the run')}
      >
        {rows ? (
          <>
            <Tag mono pressed data-part='commits-picked'>
              {rows.oldest === rows.newest
                ? shortSha(commits[rows.newest].sha)
                : `${shortSha(commits[rows.oldest].sha)} → ${shortSha(commits[rows.newest].sha)}`}
            </Tag>
            <span className='font-semibold text-text'>{plural(rows.oldest - rows.newest + 1, 'commit')}</span>
          </>
        ) : (
          <span>Pick a commit</span>
        )}
        <span className='flex-1' />
        <span className='inline-flex items-center gap-1 text-faint'>
          <Kbd combo='⇧ click' size='sm' /> for a run
        </span>
        {rows && (
          <Button id='commits-clear' variant='ghost' size='xs' onClick={() => onRun(null)}>
            Clear
          </Button>
        )}
      </div>
      <div
        role='listbox'
        aria-label='Commits'
        aria-multiselectable
        tabIndex={0}
        onKeyDown={onKeyDown}
        // a click focuses it without the keyboard's ring: Chromium shows that ring after a key, and ⇧
        // is held for a run. Taking the click's default also keeps it from selecting text
        onMouseDown={(event) => {
          event.preventDefault();
          event.currentTarget.focus({ focusVisible: false });
        }}
        // ⇧ click picks a run, not the text between two clicks
        className='grid py-1 outline-offset-[-2px] select-none focus-visible:outline-2 focus-visible:outline-focus'
      >
        {commits.map((commit, index) => {
          const picked = rows !== null && index >= rows.newest && index <= rows.oldest;
          const end = picked && (index === rows.newest || index === rows.oldest);
          return (
            <div
              key={commit.sha}
              role='option'
              aria-selected={picked}
              data-sha={commit.sha}
              data-end={end || undefined}
              onClick={(event) => pick(index, event.shiftKey)}
              {...listRow(
                picked,
                'group/commit grid cursor-pointer grid-cols-[16px_56px_minmax(0,1fr)_auto] items-center gap-2 rounded-none px-3 py-1 text-md data-selected:shadow-none',
              )}
            >
              <span
                className={
                  'relative h-full before:absolute before:inset-y-[-4px] before:left-1/2 before:w-[2px] before:-translate-x-1/2 before:bg-line after:absolute after:top-1/2 after:left-1/2 after:size-2 after:-translate-1/2 after:rounded-full after:border-2 after:border-faint after:bg-surface group-data-selected/commit:before:bg-accent group-data-selected/commit:after:border-accent group-data-selected/commit:after:bg-accent'
                }
              />
              <span className={'font-mono text-sm ' + (end ? 'font-semibold text-accent' : 'text-faint')}>
                {shortSha(commit.sha)}
              </span>
              <span className='flex min-w-0 items-center gap-2'>
                <span
                  className='overflow-hidden text-ellipsis whitespace-nowrap text-text'
                  {...tipAttrs(commit.subject, { cut: true })}
                >
                  {commit.subject}
                </span>
                {commit.onBranch && (
                  <Tag color='var(--add)' className='flex-none'>
                    this branch
                  </Tag>
                )}
              </span>
              <span className='text-xs whitespace-nowrap text-faint' {...tipAttrs(commit.author)}>
                {ago(commit.date * 1000, now)}
              </span>
            </div>
          );
        })}
      </div>
      {/* the list reaches the first commit when that has no parent: nothing more to list, unless it was asked for */}
      {(commits.at(-1)?.parent !== null || commitCount !== COMMIT_COUNTS[0]) && (
        <div
          data-part='commits-count'
          className='flex items-center justify-end gap-2 border-t border-line px-3 py-1 text-xs text-faint'
        >
          Show
          <Select
            id='commit-count'
            label='Commits listed'
            value={String(commitCount)}
            options={COMMIT_COUNTS.map((count) => ({ value: String(count), label: count + ' commits' }))}
            onChange={(value) => window.lensApp.launcher.setCommitCount(Number(value) as CommitCount)}
          />
        </div>
      )}
    </div>
  );
}
