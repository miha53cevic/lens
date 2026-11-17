import { Sandbox } from '../../../ui/sandbox/Sandbox.tsx';
import { useLauncher } from '../store.ts';
import { Reopening } from './Reopening.tsx';
import { ReviewPicker } from './ReviewPicker/index.tsx';
import { Setup } from './Setup/index.tsx';
import { Start } from './Start/index.tsx';
import { StatusLine } from './StatusLine.tsx';

export function Launcher() {
  const screen = useLauncher((store) => store.state?.screen ?? null);
  // the picker starts over for another repository, and on what a review behind it shows
  const pickerKey = useLauncher(
    (store) => (store.state?.repo?.root ?? '') + '|' + JSON.stringify(store.state?.current),
  );
  const hasRepo = useLauncher((store) => store.state?.repo != null);
  // a reopened tab on its way back to its review: nothing to pick from until that is settled
  const reopening = useLauncher((store) => store.state?.reopening != null);
  // a review the picker started: its shape covers the picker, which stays as it is underneath
  const opening = useLauncher((store) => store.state?.opening === true);
  if (screen === null) return null;
  return (
    <>
      <div className='relative flex min-h-0 flex-1 flex-col'>
        {!reopening && screen === 'start' && <Start />}
        {!reopening && screen === 'picker' && hasRepo && <ReviewPicker key={pickerKey} />}
        {screen === 'setup' && <Setup />}
        {screen === 'sandbox' && <Sandbox />}
        {(reopening || opening) && <Reopening />}
      </div>
      <StatusLine />
    </>
  );
}
