import { Fragment, useState } from 'react';
import { useLens } from '../../store.ts';
import { ModalHead } from '../ModalHead.tsx';
import { KEY_TABS, type KeyTab } from './const.ts';
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
      <div className='modal-body'>
        <div className='key-tabs' role='tablist'>
          {tabs.map((keyTab) => (
            <button
              key={keyTab.id}
              className='key-tab'
              role='tab'
              data-tab={keyTab.id}
              aria-selected={keyTab.id === shown.id}
              onClick={() => setTab(keyTab.id)}
            >
              {keyTab.label}
            </button>
          ))}
        </div>
        <table className='set-table'>
          <tbody>
            {shown.keys.map((help) => (
              <tr key={help.keys.join()}>
                <td>
                  {help.keys.map((key, keyIndex) => (
                    <Fragment key={key}>
                      {keyIndex > 0 && ' / '}
                      <kbd>{key}</kbd>
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
