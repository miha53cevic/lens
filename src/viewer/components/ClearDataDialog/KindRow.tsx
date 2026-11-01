import type { ClearScope } from '../../../cli-app/clear.ts';
import { Choice } from '../../../ui/Choice.tsx';
import { Select } from '../../../ui/Select.tsx';

const SCOPE_LABELS: Record<ClearScope, string> = { this: 'This review', all: 'All reviews' };

interface KindRowProps {
  id: string;
  label: string;
  /** How much it holds, in the scope picked */
  detail: string;
  /** Nothing saved in any scope: nothing to tick */
  empty: boolean;
  warning: string | null;
  checked: boolean;
  onCheck: (on: boolean) => void;
  /** More than one: a dropdown between them, on the row's right */
  scopes?: ClearScope[];
  scope?: ClearScope;
  scopeCount?: (scope: ClearScope) => number;
  onScope?: (scope: ClearScope) => void;
}

/** One kind of saved data: a row that ticks it, with its scope on the right; under it, what clearing it would interrupt. */
export function KindRow({
  id,
  label,
  detail,
  empty,
  warning,
  checked,
  onCheck,
  scopes,
  scope,
  scopeCount,
  onScope,
}: KindRowProps) {
  const scoped = scopes && scopes.length > 1 && scope && onScope;
  return (
    <>
      <Choice
        type='checkbox'
        id={'clear-' + id}
        data-kind={id}
        checked={checked}
        disabled={empty}
        onChange={onCheck}
        label={label}
        hint={empty ? 'nothing saved' : detail}
        // which reviews, always in sight on the row's right, as the picker's base branch is
        meta={
          scoped && !empty ? (
            <Select
              id={'clear-scope-' + id}
              label={label + ': which reviews'}
              value={scope}
              options={scopes.map((option) => ({
                value: option,
                label: SCOPE_LABELS[option] + (option === 'all' && scopeCount ? ' · ' + scopeCount(option) : ''),
              }))}
              onChange={(value) => onScope(value as ClearScope)}
            />
          ) : undefined
        }
      />
      {checked && warning && <p className='m-0 pr-3 pb-2 pl-[40px] text-sm/[1.45] text-risk'>{warning}</p>}
    </>
  );
}
