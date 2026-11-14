import { Fragment } from 'react';
import { stepHeadings, type InboxFlow } from '../../../../model/inbox.ts';
import { toggleInboxFlow, toggleInboxRead } from '../../../../actions/inbox.ts';
import { Disclosure } from '../../../../../ui/Disclosure.tsx';
import { UnitCard } from './UnitCard.tsx';
import { tipAttrs } from '../../../../../ui/Tip.tsx';

interface FlowSectionProps {
  flow: InboxFlow;
  isActive: (unitId: string) => boolean;
}

/** One flow: its head (what's left to read, how far it got), its cards to read, then its Read area. */
export function FlowSection({ flow, isActive }: FlowSectionProps) {
  const { key, toRead, read, open, readOpen } = flow;
  const total = toRead.length + read.length;
  const headings = stepHeadings(flow);
  return (
    <section
      data-part='inbox-flow'
      data-open={open || undefined}
      data-done={toRead.length === 0 || undefined}
      // folded, the whole section is one target
      className='group/flow not-data-open:cursor-pointer rounded-lg border border-line bg-[color-mix(in_oklab,var(--surface-2)_45%,transparent)]'
      data-inbox-flow={key}
      // folded, the whole section opens it, not only its head
      onClick={open ? undefined : () => toggleInboxFlow(key)}
    >
      <Disclosure
        open={open}
        data-part='inbox-flow-head'
        // no hover tint: on an open flow it would cover the head, not the section. The tooltip answers instead
        className='group/head grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0 rounded-lg px-3 py-2 text-text not-disabled:hover:bg-transparent hover:[&>.pk]:text-accent group-[:not([data-open]):hover]/flow:[&>.pk]:text-accent'
        {...tipAttrs(flow.flow?.why)}
        onClick={(event) => {
          event.stopPropagation();
          toggleInboxFlow(key);
        }}
      >
        <span
          data-part='t'
          className='overflow-hidden text-md font-semibold text-ellipsis whitespace-nowrap [transition:color_var(--motion)] group-hover/head:text-accent group-data-done/flow:font-medium group-data-done/flow:text-muted group-[:not([data-open]):hover]/flow:text-accent'
        >
          {flow.flow ? flow.flow.title : 'Not in a story'}
        </span>
        <span data-part='n' className='text-xs text-muted group-data-done/flow:text-add'>
          {toRead.length > 0 ? toRead.length + ' to read' : 'all read'}
        </span>
        {flow.flow?.path && (
          <span className='col-[2/-1] overflow-hidden font-mono text-xs text-ellipsis whitespace-nowrap text-faint'>
            {flow.flow.path}
          </span>
        )}
        <span className='col-[2/-1] mt-1 h-[3px] overflow-hidden rounded-full bg-line'>
          <i
            className='block h-full rounded-full bg-add [transition:width_var(--motion-move)]'
            style={{ width: (100 * read.length) / total + '%' }}
          />
        </span>
      </Disclosure>
      {open && (
        <div data-part='inbox-body' className='flex flex-col gap-2 px-2 pb-2'>
          {toRead.map((unit) => (
            <Fragment key={unit.id}>
              {headings.has(unit.id) && (
                <div data-part='inbox-step' className='px-1 pt-1 eyebrow sm'>
                  {headings.get(unit.id)}
                </div>
              )}
              <UnitCard unit={unit} active={isActive(unit.id)} />
            </Fragment>
          ))}
          {read.length > 0 && (
            <Disclosure
              open={readOpen}
              data-part='inbox-read-toggle'
              className='text-faint eyebrow sm'
              onClick={() => toggleInboxRead(key)}
            >
              Read{' '}
              <span data-part='n' className='ml-1 tabular-nums'>
                {read.length}
              </span>
            </Disclosure>
          )}
          {read.length > 0 && readOpen && (
            <div data-part='inbox-read' className='flex flex-col gap-2'>
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
