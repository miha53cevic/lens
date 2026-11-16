import clsx from 'clsx';
import type { InboxFlow } from '../../../../model/inbox.ts';
import { railEntries } from '../../../../model/steps.ts';
import { toggleInboxFlow, toggleInboxRead } from '../../../../actions/inbox.ts';
import { Disclosure } from '../../../../../ui/Disclosure.tsx';
import { UnitCard } from './UnitCard.tsx';
import { tipAttrs } from '../../../../../ui/Tip.tsx';

interface FlowSectionProps {
  flow: InboxFlow;
  isActive: (unitId: string) => boolean;
  /** The only section, and no story: its cards alone, with no head or frame to say "not in a story" */
  bare?: boolean;
}

/** One flow: its head (what's left to read, how far it got), its cards to read, then its Read area. */
export function FlowSection({ flow, isActive, bare }: FlowSectionProps) {
  const { key, toRead, read, readOpen } = flow;
  const open = bare || flow.open;
  const total = toRead.length + read.length;
  const entries = railEntries(flow);
  const railed = entries.some((entry) => entry.kind === 'step');
  return (
    <section
      data-part='inbox-flow'
      data-open={open || undefined}
      data-done={toRead.length === 0 || undefined}
      data-bare={bare || undefined}
      // folded, the whole section is one target
      className={
        bare
          ? 'group/flow'
          : 'group/flow not-data-open:cursor-pointer rounded-lg border border-line bg-[color-mix(in_oklab,var(--surface-2)_45%,transparent)]'
      }
      data-inbox-flow={key}
      // folded, the whole section opens it, not only its head
      onClick={open ? undefined : () => toggleInboxFlow(key)}
    >
      {!bare && (
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
          {/* open, its rail draws the path */}
          {flow.flow?.path && !(open && railed) && (
            <span
              data-part='path'
              className='col-[2/-1] overflow-hidden font-mono text-xs text-ellipsis whitespace-nowrap text-faint'
            >
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
      )}
      {open && (
        <div data-part='inbox-body' className={clsx('flex flex-col gap-2', !bare && 'px-2 pb-2')}>
          <div
            data-part={railed ? 'inbox-steps' : undefined}
            className={clsx(
              'flex flex-col gap-2',
              // the flow's path as a line its steps sit on, the cards hanging off it
              railed &&
                'relative pl-4 before:absolute before:top-3 before:bottom-3 before:left-[5px] before:w-[2px] before:rounded-full before:bg-line',
            )}
          >
            {entries.map((entry, index) =>
              entry.kind === 'unit' ? (
                <UnitCard key={entry.unit.id} unit={entry.unit} active={isActive(entry.unit.id)} />
              ) : (
                <div
                  key={'step:' + index}
                  data-part='inbox-step'
                  data-done={entry.done || undefined}
                  className="relative pt-1 eyebrow sm before:absolute before:top-[calc(50%+2px)] before:-left-[15px] before:size-[10px] before:-translate-y-1/2 before:rounded-full before:border-2 before:border-line-strong before:bg-surface before:content-[''] data-done:text-faint data-done:before:border-add data-done:before:bg-add"
                >
                  {entry.name}
                  {entry.done && <span className='ml-2 font-normal text-add'>read</span>}
                </div>
              ),
            )}
          </div>
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
