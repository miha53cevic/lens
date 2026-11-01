import type { ReactNode } from 'react';
import type { RepoInfo } from '../../../shared/api.ts';
import { plural } from '../../../../cli-app/text.ts';
import { Field } from '../../../../ui/Field.tsx';
import { Choice, ChoiceList } from '../../../../ui/Choice.tsx';
import { Select } from '../../../../ui/Select.tsx';
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

interface RangeChoiceProps {
  value: Range;
  picked: Range;
  onPick: (range: Range) => void;
  name: ReactNode;
  sub: ReactNode;
  /** On the right: a count, or the field the choice needs */
  meta?: ReactNode;
  disabled?: boolean;
}

/** One way to pick changes: ui/Choice, as one of the ranges. */
function RangeChoice({ value, picked, onPick, name, sub, meta, disabled }: RangeChoiceProps) {
  return (
    <Choice
      type='radio'
      name='range'
      data-range={value}
      checked={picked === value}
      onChange={() => onPick(value)}
      disabled={disabled}
      label={name}
      hint={sub}
      meta={meta}
    />
  );
}

/** `lens diff`, four ways. */
export function Changes({ repo, range, onRange, base, onBase, custom, onCustom }: ChangesProps) {
  const bases = baseOptions(repo);
  const shared = { picked: range, onPick: onRange };
  return (
    <ChoiceList type='radio' label='Changes'>
      <RangeChoice
        {...shared}
        value='worktree'
        // an empty range can't be opened: the CLI finds nothing in it
        disabled={repo.changed === 0}
        name='Working tree'
        sub={repo.changed === 0 ? 'Nothing unstaged right now' : "Changes you haven't staged"}
        meta={plural(repo.changed, 'file')}
      />
      <RangeChoice
        {...shared}
        value='staged'
        disabled={repo.staged === 0}
        name='Staged'
        sub={repo.staged === 0 ? 'Nothing staged right now' : 'What the next commit would take'}
        meta={plural(repo.staged, 'file')}
      />
      <RangeChoice
        {...shared}
        value='branch'
        disabled={bases.length === 0}
        name={
          <>
            This branch vs
            {bases.length > 0 && (
              <Select
                id='picker-base'
                label='The branch to compare against'
                value={base}
                options={bases}
                onChange={onBase}
              />
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
      <RangeChoice
        {...shared}
        value='custom'
        name='Custom'
        sub={
          <>
            Any <code>git diff</code> arguments
          </>
        }
        meta={
          <Field
            size='sm'
            mono
            id='picker-custom'
            className='w-[220px]'
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
    </ChoiceList>
  );
}
