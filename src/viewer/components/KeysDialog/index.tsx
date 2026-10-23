import { Fragment, useState } from 'react';
import { useLens } from '../../store.ts';
import { ModalHead } from '../ModalHead.tsx';
import { Kbd } from '../../../ui/Kbd.tsx';
import { Segmented } from '../../../ui/Segmented.tsx';
import { KEY_TABS, type KeyTab } from './const.ts';
import '../SettingsRows.css';
import './style.css';

/** The ? help: every keyboard shortcut, in tabs: Global, Code, Summary (with a summary only). */
export function KeysDialog() {
  const hasSummary = useLens((state) => !!state.data.summary);
  const [tab, setTab] = useState<KeyTab>('global');
  const tabs = KEY_TABS.filter((keyTab) => hasSummary || keyTab.id !== 'summary');
  const shown = tabs.find((keyTab) => keyTab.id === tab) ?? tabs[0];

  return (
    <dialog id='keys-modal'>
      <ModalHead title='Keyboard shortcuts' />
      {/* outside the body: the keys scroll under the tabs, not with them */}
      <div className='key-tabs'>
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
      <div className='modal-body'>
        <table className='set-table'>
          <tbody>
            {shown.keys.map((help) => (
              <tr key={help.keys.join()}>
                <td>
                  {help.keys.map((key, keyIndex) => (
                    <Fragment key={key}>
                      {keyIndex > 0 && ' / '}
                      <Kbd combo={key} />
                    </Fragment>
                  ))}
                </td>
                <td>
                  {help.action}
                  {help.note && (
                    <>
                      {' '}
                      <span className='set-source'>{help.note}</span>
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
