// The viewer's status bar: ui/StatusBar, saying what model/status.ts decides. A status or a notice
// names its action; const.ts is where it runs.

import { useLens } from '../../store.ts';
import { barNotices, barStatus } from '../../model/status.ts';
import { StatusBar as Bar } from '../../../ui/StatusBar.tsx';
import { NOTICE_ACTIONS, STATUS_ACTIONS } from './const.ts';

export function StatusBar() {
  const status = useLens(barStatus);
  const notices = useLens(barNotices);
  return (
    <Bar
      status={{ ...status, action: status.action && STATUS_ACTIONS[status.action] }}
      notices={notices.map((notice) => ({
        id: notice.id,
        text: notice.text,
        tone: notice.tone,
        run: notice.action ? NOTICE_ACTIONS[notice.action] : undefined,
      }))}
    />
  );
}
