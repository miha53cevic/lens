import type { ClearScope } from '../../../cli-app/clear.ts';
import { Choice } from '../../../ui/Choice.tsx';
import { Segmented } from '../../../ui/Segmented.tsx';

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
  /** More than one: a switch between them, once the row is ticked */
  scopes?: ClearScope[];
  scope?: ClearScope;
  scopeCount?: (scope: ClearScope) => number;
  onScope?: (scope: ClearScope) => void;
}

/** One kind of saved data: a row that ticks it; then, under it, its scope and what clearing it would interrupt. */
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
      />
      {checked && (scoped || warning) && (
        <div className='clear-kind-more'>
          {scoped && (
            <Segmented
              id={'clear-scope-' + id}
              label={label + ': which reviews'}
              options={scopes.map((option) => ({
                value: option,
                label: SCOPE_LABELS[option] + (option === 'all' && scopeCount ? ' · ' + scopeCount(option) : ''),
              }))}
              value={scope}
              onChange={onScope}
            />
          )}
          {warning && <p className='clear-warning'>{warning}</p>}
        </div>
      )}
    </>
  );
}
