import { Fragment } from 'react';
import { ModalHead } from '../ModalHead.tsx';
import { KEYS, SUMMARY_TOOLBAR_KEYS } from './const.ts';

/** The ? help: every keyboard shortcut. */
export function KeysDialog() {
  return (
    <dialog id='keys-modal'>
      <ModalHead title='keyboard shortcuts' />
      <div className='modal-body'>
        <table className='set-table'>
          <tbody>
            {KEYS.map((help) => (
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
            <tr>
              <td colSpan={2} className='set-source'>
                in Summary: <kbd>g</kbd> overview · <kbd>j</kbd> / <kbd>k</kbd> next / previous change · <kbd>o</kbd>{' '}
                open it in the code view · <kbd>/</kbd> filter the changes · the toolbar's keys (
                {SUMMARY_TOOLBAR_KEYS.map((key, keyIndex) => (
                  <Fragment key={key}>
                    {keyIndex > 0 && ' '}
                    <kbd>{key}</kbd>
                  </Fragment>
                ))}
                ) act on the open change · <kbd>a</kbd> <kbd>\</kbd> work as in the code view
              </td>
            </tr>
            <tr>
              <td>
                <kbd>?</kbd>
              </td>
              <td>this help</td>
            </tr>
            <tr>
              <td>
                <kbd>Esc</kbd>
              </td>
              <td>close dialogs · clear the filter · leave the Ask input</td>
            </tr>
          </tbody>
        </table>
      </div>
    </dialog>
  );
}
