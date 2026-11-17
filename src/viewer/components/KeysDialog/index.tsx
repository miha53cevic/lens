import { Fragment, useState } from 'react';
import { Search } from 'lucide-react';
import { useLens } from '../../store.ts';
import { DIALOG, LARGE_DIALOG, ModalHead } from '../ModalHead.tsx';
import { cn } from '../../../ui/cn.ts';
import { Field } from '../../../ui/Field.tsx';
import { Kbd } from '../../../ui/Kbd.tsx';
import { Tag } from '../../../ui/Tag.tsx';
import { KEY_GROUPS, type KeyGroup } from './const.ts';
import { keysShown } from './util.ts';

/** A capital letter is that letter with shift: "N" reads as ⇧ N, not as n again. */
function keycap(key: string): string {
  return /^[A-Z]$/.test(key) ? '⇧' + key : key;
}

function Group({ group, here }: { group: KeyGroup; here: boolean }) {
  return (
    <section
      data-part='key-group'
      data-group={group.id}
      data-here={here || undefined}
      className='mb-5 break-inside-avoid'
    >
      <h3 className='m-0 mb-1 flex items-center gap-2'>
        <span className={cn('eyebrow', here && 'text-accent')}>{group.label}</span>
        {here && <Tag color='var(--accent)'>you are here</Tag>}
        {group.diff && <Tag>diff only</Tag>}
      </h3>
      {group.keys.map((row) => (
        <div
          key={row.keys.join()}
          data-part='key-row'
          className='grid min-h-control grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line last:border-b-0'
        >
          <span className='min-w-0 text-text'>
            {row.action}
            {row.hint && <span className='ml-2 text-xs text-faint'>{row.hint}</span>}
            {row.diff && <Tag className='ml-2'>diff</Tag>}
          </span>
          {/* one cell for all of a row's keys: j and k side by side, never stacked */}
          <span data-part='key-combos' className='inline-flex items-center gap-2 whitespace-nowrap'>
            {row.keys.map((key, keyIndex) => (
              <Fragment key={key}>
                {keyIndex > 0 && <span className='text-faint'>/</span>}
                <Kbd combo={keycap(key)} />
              </Fragment>
            ))}
          </span>
        </div>
      ))}
    </section>
  );
}

/**
 * The ? help: every shortcut on one page, in groups, the reader's view first. Typing filters, by its
 * words or by a key itself.
 */
export function KeysDialog() {
  const { view, hasSummary, planTab } = useLens((state) => ({
    view: state.view,
    hasSummary: !!state.data.summary,
    planTab: state.data.planTab,
  }));
  const [query, setQuery] = useState('');
  const { groups, here } = keysShown(KEY_GROUPS, { view, hasSummary, planTab, query });

  return (
    <dialog id='keys-modal' tabIndex={-1} className={cn(DIALOG, LARGE_DIALOG)} onClose={() => setQuery('')}>
      <ModalHead title='Keyboard shortcuts' />
      {/* outside the body: the keys scroll under the filter, not with it */}
      <div data-part='keys-filter-bar' className='flex-none px-4 pt-4 pb-3'>
        <Field
          id='keys-filter'
          icon={<Search size={14} />}
          placeholder='Filter by a word or a key'
          aria-label='Filter shortcuts'
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClear={query ? () => setQuery('') : undefined}
          clearLabel='Clear the filter'
        />
      </div>
      <div data-part='modal-body' className='min-h-0 flex-1 overflow-y-auto px-4 pt-0 pb-5 text-md'>
        {groups.length === 0 ? (
          <div className='no-match'>no shortcut matches</div>
        ) : (
          <div data-part='key-groups' className='columns-[2_320px] gap-x-8'>
            {groups.map((group) => (
              <Group key={group.id} group={group} here={group.id === here} />
            ))}
          </div>
        )}
      </div>
    </dialog>
  );
}
