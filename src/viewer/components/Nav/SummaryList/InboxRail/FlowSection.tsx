import clsx from 'clsx';
import type { InboxFlow } from '../../../../model/inbox.ts';
import { toggleInboxFlow, toggleInboxRead } from '../../../../actions/inbox.ts';
import { Disclosure } from '../../../../../ui/Disclosure.tsx';
import { UnitCard } from './UnitCard.tsx';

interface FlowSectionProps {
  flow: InboxFlow;
  isActive: (unitId: string) => boolean;
}

/** One flow: its head (what's left to read, how far it got), its cards to read, then its Read area. */
export function FlowSection({ flow, isActive }: FlowSectionProps) {
  const { key, toRead, read, open, readOpen } = flow;
  const total = toRead.length + read.length;
  return (
    <section
      className={clsx('inbox-flow', open && 'open', toRead.length === 0 && 'done')}
      data-inbox-flow={key}
      // folded, the whole section opens it, not only its head
      onClick={open ? undefined : () => toggleInboxFlow(key)}
    >
      <Disclosure
        open={open}
        className='inbox-flow-head'
        title={flow.flow?.why}
        onClick={(event) => {
          event.stopPropagation();
          toggleInboxFlow(key);
        }}
      >
        <span className='t'>{flow.flow ? flow.flow.title : 'Not in a story'}</span>
        <span className='n'>{toRead.length > 0 ? toRead.length + ' to read' : 'all read'}</span>
        {flow.flow?.path && <span className='path'>{flow.flow.path}</span>}
        <span className='bar'>
          <i style={{ width: (100 * read.length) / total + '%' }} />
        </span>
      </Disclosure>
      {open && (
        <div className='inbox-body'>
          {toRead.map((unit) => (
            <UnitCard key={unit.id} unit={unit} active={isActive(unit.id)} />
          ))}
          {read.length > 0 && (
            <Disclosure open={readOpen} className='inbox-read-toggle eyebrow sm' onClick={() => toggleInboxRead(key)}>
              Read <span className='n'>{read.length}</span>
            </Disclosure>
          )}
          {read.length > 0 && readOpen && (
            <div className='inbox-read'>
              {read.map((unit) => (
                <UnitCard key={unit.id} unit={unit} active={isActive(unit.id)} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
