import { Fragment, useState } from 'react';
import { useLens } from '../../store.ts';
import { DIALOG, ModalHead } from '../ModalHead.tsx';
import { cn } from '../../../ui/cn.ts';
import { Kbd } from '../../../ui/Kbd.tsx';
import { Segmented } from '../../../ui/Segmented.tsx';
import { KEY_TABS, type KeyTab } from './const.ts';

/** The ? help: every keyboard shortcut, in tabs: Global, Code, Summary (with a summary only), Plan (with its tab on). */
export function KeysDialog() {
  const { hasSummary, planTab } = useLens((state) => ({
    hasSummary: !!state.data.summary,
    planTab: state.data.planTab,
  }));
  const [tab, setTab] = useState<KeyTab>('global');
  const tabs = KEY_TABS.filter(
    (keyTab) => (hasSummary || keyTab.id !== 'summary') && (planTab || keyTab.id !== 'plan'),
  );
  const shown = tabs.find((keyTab) => keyTab.id === tab) ?? tabs[0];

  return (
    <dialog id='keys-modal' tabIndex={-1} className={cn(DIALOG, 'h-[min(34rem,calc(var(--screen-h)*0.8))]')}>
      <ModalHead title='Keyboard shortcuts' />
      {/* outside the body: the keys scroll under the tabs, not with them */}
      <div data-part='key-tabs' className='flex-none px-4 pt-4 pb-3'>
        <Segmented
          id='key-tabs'
          label='shortcuts for'
          size='lg'
          tabs
          options={tabs.map((keyTab) => ({ value: keyTab.id, label: keyTab.label }))}
          value={shown.id}
          onChange={setTab}
        />
      </div>
      <div data-part='modal-body' className='min-h-0 flex-1 overflow-y-auto px-4 pt-0 pb-5 text-md'>
        <table
          data-part='set-table'
          className='w-full border-collapse [&_td]:border-b [&_td]:border-line [&_td]:py-1 [&_td]:pr-3 [&_td]:pl-0 [&_td]:align-middle [&_td]:text-muted [&_td:first-child]:w-[9rem] [&_td:first-child]:whitespace-nowrap [&_td:first-child]:text-text'
        >
          <tbody>
            {shown.keys.map((help) => (
              <tr key={help.keys.join()}>
                <td>
                  {help.keys.map((key, keyIndex) => (
                    <Fragment key={key}>
                      {keyIndex > 0 && ' / '}
                      {/* a capital letter is that letter with shift: "N" reads as ⇧ N, not as n again */}
                      <Kbd combo={/^[A-Z]$/.test(key) ? '⇧' + key : key} />
                    </Fragment>
                  ))}
                </td>
                <td>
                  {help.action}
                  {help.note && (
                    <>
                      {' '}
                      <span className='break-all text-muted [&_code]:text-text'>{help.note}</span>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </dialog>
  );
}
