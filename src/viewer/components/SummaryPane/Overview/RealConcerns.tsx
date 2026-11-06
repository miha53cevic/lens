import { useState } from 'react';
import { Copy } from 'lucide-react';
import type { ReaderNote } from '../../../../cli-app/notes/store.ts';
import { getState, useLens } from '../../../store.ts';
import { confirmedLabel, handoff } from '../../../model/realConcerns.ts';
import type { Finding, Unit } from '../../../model/signals.ts';
import { copyForAgent } from '../../../actions/notes.ts';
import { openSummaryUnit } from '../../../actions/summary.ts';
import { jumpToLine } from '../../../actions/views.ts';
import { plural } from '../../../shared.ts';
import { Button } from '../../../../ui/Button.tsx';
import { ListRow } from '../../../../ui/ListRow.tsx';
import { AgentText } from '../../AgentText.tsx';
import { CopiedLabel } from '../../CopiedLabel.tsx';
import { SignalIcon } from '../../SignalIcon.tsx';

/** One item that goes to the agent: its signal, what it says on one line, and where it is. */
function Item({
  signal,
  text,
  place,
  onOpen,
}: {
  signal: 'bug' | 'risk' | 'question' | 'breaks';
  text: string;
  place: string;
  onOpen: () => void;
}) {
  return (
    <ListRow
      data-part='ov-real-item'
      data-sig={signal}
      className={'sig-' + signal + ' flex w-full min-w-0 items-center gap-2 px-2 py-1 text-sm'}
      onClick={onOpen}
    >
      <span className='inline-flex flex-none text-(--sig)'>
        <SignalIcon signal={signal} size={12} />
      </span>
      <span className='min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-text'>
        <AgentText text={text} />
      </span>
      <span className='flex-none font-mono text-xs text-muted'>{place}</span>
    </ListRow>
  );
}

function openNote(note: ReaderNote) {
  const fileIndex = getState().data.files.findIndex((file) => file.file === note.file);
  if (fileIndex >= 0) jumpToLine(fileIndex, note.start);
}

const findingItem = ({ unit, finding }: { unit: Unit; finding: Finding }) => (
  <Item
    key={finding.key}
    signal={finding.kind}
    text={finding.text}
    place={unit.name}
    onOpen={() => openSummaryUnit(unit.id)}
  />
);

/**
 * The concerns and possible breaks the reader marked real, and the notes they wrote for the agent, ready to hand
 * over: listed, and one click copies them, each with its place in the code. Shown only while there is one, or a
 * confirmed one on code that changed since. lens fixes nothing itself.
 */
export function RealConcerns() {
  const real = useLens(handoff);
  const copied = useLens((state) => state.handoffCopied);
  // no clipboard (an insecure origin, a denied permission): the text itself, to select and copy
  const [shown, setShown] = useState(false);
  const count = real.items.length + real.notes.length;
  if (count === 0 && real.stale === 0) return null;

  const copy = async (button: HTMLElement) => {
    if (!(await copyForAgent(real, button))) setShown(true);
  };
  return (
    <div data-part='ov-real' className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-center justify-between gap-x-4 gap-y-2'>
        <span className='flex min-w-0 items-baseline gap-3'>
          <span className='eyebrow'>For your agent</span>
          <span data-part='ov-real-count' className='min-w-0 text-sm text-muted'>
            {count > 0 && confirmedLabel(real, 'confirmed ')}
            {/* the notes are on lines, not in changes: the count of changes is for confirmed findings alone */}
            {real.items.length > 0 && real.notes.length === 0 && <> in {plural(real.unitCount, 'change')}</>}
            {real.stale > 0 && (
              <span className='text-mod'>
                {(count > 0 ? ' · ' + real.stale + ' more' : plural(real.stale, 'confirmed finding')) +
                  ' on code that changed since'}
              </span>
            )}
          </span>
        </span>
        {count > 0 && (
          <Button
            size='sm'
            data-part='ov-real-copy'
            data-copied={copied ? '' : undefined}
            className={copied ? 'text-add' : undefined}
            onClick={(event) => void copy(event.currentTarget)}
          >
            <CopiedLabel copied={copied} size={13}>
              <Copy size={13} /> Copy for your agent
            </CopiedLabel>
          </Button>
        )}
      </div>
      {count > 0 && (
        <div data-part='ov-real-items' className='flex flex-col rounded-md border border-line bg-surface p-2'>
          {real.notes.map((note) => (
            <Item
              key={note.id}
              signal={note.kind as 'bug' | 'risk' | 'question'}
              text={note.text.split('\n')[0]}
              place={note.file.split('/').pop() + ':' + note.start}
              onOpen={() => openNote(note)}
            />
          ))}
          {real.items.map(findingItem)}
        </div>
      )}
      {shown && (
        <pre className='m-0 font-mono text-sm/[1.6] [overflow-wrap:anywhere] whitespace-pre-wrap text-muted select-all'>
          {real.text}
        </pre>
      )}
    </div>
  );
}
