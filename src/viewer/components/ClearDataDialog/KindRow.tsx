import clsx from 'clsx';
import type { ClearScope } from '../../../cli-app/clear.ts';
import { Chip } from '../../../ui/Chip.tsx';
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

/** One kind of saved data: its tick, how much it holds, and its scope. */
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
  return (
    <div className={clsx('clear-kind', checked && 'on')} data-kind={id}>
      <div className='clear-kind-head'>
        {empty ? (
          <span className='clear-kind-label'>{label}</span>
        ) : (
          <Chip id={'clear-' + id} checked={checked} onChange={onCheck}>
            {label}
          </Chip>
        )}
        <span className='clear-kind-detail'>{empty ? 'nothing saved' : detail}</span>
      </div>
      {checked && scopes && scopes.length > 1 && scope && onScope && (
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
  );
}
