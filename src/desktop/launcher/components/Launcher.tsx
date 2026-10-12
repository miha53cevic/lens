import { useLauncher } from '../store.ts';
import { Reopening } from './Reopening.tsx';
import { ReviewPicker } from './ReviewPicker/index.tsx';
import { Settings } from './Settings.tsx';
import { Start } from './Start.tsx';
import { StatusLine } from './StatusLine.tsx';
import './Launcher.css';

export function Launcher() {
  const screen = useLauncher((store) => store.state?.screen ?? null);
  // the picker starts over for another repository, and on what a review behind it shows
  const pickerKey = useLauncher(
    (store) => (store.state?.repo?.root ?? '') + '|' + JSON.stringify(store.state?.current),
  );
  const hasRepo = useLauncher((store) => store.state?.repo != null);
  // a reopened tab on its way back to its review: nothing to pick from until that is settled
  const reopening = useLauncher((store) => store.state?.reopening != null);
  if (screen === null) return null;
  return (
    <>
      {reopening && <Reopening />}
      {!reopening && screen === 'start' && <Start />}
      {!reopening && screen === 'picker' && hasRepo && <ReviewPicker key={pickerKey} />}
      {screen === 'settings' && <Settings />}
      <StatusLine />
    </>
  );
}
