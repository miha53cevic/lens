import { useLauncher } from '../store.ts';
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
  if (screen === null) return null;
  return (
    <>
      {screen === 'start' && <Start />}
      {screen === 'picker' && hasRepo && <ReviewPicker key={pickerKey} />}
      {screen === 'settings' && <Settings />}
      <StatusLine />
    </>
  );
}
