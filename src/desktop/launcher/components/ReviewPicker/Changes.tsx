import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { RepoInfo } from '../../../shared/api.ts';
import { plural } from '../../../../cli-app/text.ts';
import { baseOptions, type Range } from './util.ts';

interface ChangesProps {
  repo: RepoInfo;
  range: Range;
  onRange: (range: Range) => void;
  base: string;
  onBase: (base: string) => void;
  custom: string;
  onCustom: (args: string) => void;
}

interface ChoiceProps {
  value: Range;
  picked: Range;
  onPick: (range: Range) => void;
  name: ReactNode;
  sub: ReactNode;
  /** On the right: a count, or the field the choice needs */
  meta?: ReactNode;
  disabled?: boolean;
}

/** One way to pick changes: a radio that looks like a row. */
function Choice({ value, picked, onPick, name, sub, meta, disabled }: ChoiceProps) {
  return (
    <label className={clsx('choice', picked === value && 'checked', disabled && 'disabled')} data-range={value}>
      <input
        type='radio'
        name='range'
        value={value}
        checked={picked === value}
        disabled={disabled}
        onChange={() => onPick(value)}
      />
      <span className='choice-radio' />
      <span className='choice-text'>
        <span className='choice-name'>{name}</span>
        <span className='choice-sub'>{sub}</span>
      </span>
      {meta !== undefined && <span className='choice-meta'>{meta}</span>}
    </label>
  );
}

/** `lens diff`, four ways. */
export function Changes({ repo, range, onRange, base, onBase, custom, onCustom }: ChangesProps) {
  const bases = baseOptions(repo);
  const shared = { picked: range, onPick: onRange };
  return (
    <div className='choices' role='radiogroup' aria-label='Changes'>
      <Choice
        {...shared}
        value='worktree'
        name='Working tree'
        sub="Changes you haven't staged"
        meta={plural(repo.changed, 'file')}
      />
      <Choice
        {...shared}
        value='staged'
        name='Staged'
        sub='What the next commit would take'
        meta={plural(repo.staged, 'file')}
      />
      <Choice
        {...shared}
        value='branch'
        disabled={bases.length === 0}
        name={
          <>
            This branch vs{' '}
            {bases.length > 0 && (
              <select
                id='picker-base'
                className='choice-select'
                aria-label='The branch to compare against'
                value={base}
                onChange={(event) => onBase(event.target.value)}
              >
                {bases.map((branch) => (
                  <option key={branch}>{branch}</option>
                ))}
              </select>
            )}
          </>
        }
        sub={
          bases.length > 0
            ? `Everything this branch adds, from where it left ${base}`
            : 'There is no other branch to compare against'
        }
        // the count is against the base it was asked for: shown once it is this one's
        meta={bases.length > 0 && repo.base === base && repo.ahead !== null ? plural(repo.ahead, 'commit') : ''}
      />
      <Choice
        {...shared}
        value='custom'
        name='Custom'
        sub={
          <>
            Any <code>git diff</code> arguments
          </>
        }
        meta={
          <input
            id='picker-custom'
            className='choice-input'
            aria-label='git diff arguments'
            placeholder='HEAD~3 -- src/'
            value={custom}
            onFocus={() => onRange('custom')}
            onChange={(event) => {
              onRange('custom');
              onCustom(event.target.value);
            }}
          />
        }
      />
    </div>
  );
}
