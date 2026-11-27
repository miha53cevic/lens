import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../../ui/Button.tsx';
import { Disclosure } from '../../../../ui/Disclosure.tsx';
import { notesHtml } from './notes.ts';

/** A release's notes under its row: "What's new in x", opened on a click, and the way to them on GitHub. */
export function ReleaseNotes({ version, notes, open: startOpen }: { version: string; notes: string; open: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <div data-part='release-notes' data-open={open || undefined} className='-mx-2 grid gap-1'>
      <Disclosure open={open} onClick={() => setOpen(!open)} className='w-fit text-sm text-text'>
        What's new in {version}
      </Disclosure>
      {open && (
        <div className='grid justify-items-start gap-2 px-2'>
          <div
            data-part='release-notes-text'
            className='text-sm leading-[1.55] text-muted [&_li]:my-1 [&_p]:my-1 [&_ul]:my-0 [&_ul]:pl-4'
            dangerouslySetInnerHTML={{ __html: notesHtml(notes) }}
          />
          <Button size='xs' variant='ghost' onClick={() => window.lensApp.launcher.openReleaseNotes()}>
            Full notes on GitHub
            <ExternalLink size={12} />
          </Button>
        </div>
      )}
    </div>
  );
}
