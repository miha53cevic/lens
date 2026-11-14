// The viewer's status bar: ui/StatusBar, saying what model/status.ts decides. A status or a notice
// names its action; const.ts is where it runs.

import { useLens } from '../../store.ts';
import { StatusBar as Bar } from '../../../ui/StatusBar.tsx';
import type { ReactNode } from 'react';
import { Braces } from 'lucide-react';
import { barNotices, barStatus, type NoticeIconId } from '../../model/status.ts';
import { Spinner } from '../../../ui/Spinner.tsx';
import { NOTICE_ACTIONS, STATUS_ACTIONS } from './const.ts';

// a language server's mark, as editors show it; turning while it starts
const NOTICE_ICONS: Record<NoticeIconId, ReactNode> = {
  typescript: <Braces size={13} className='flex-none text-accent' />,
  'typescript-busy': <Spinner className='flex-none text-muted' />,
};

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
        icon: notice.icon && NOTICE_ICONS[notice.icon],
        title: notice.title,
      }))}
    />
  );
}
