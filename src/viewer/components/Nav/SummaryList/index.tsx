import { Fragment } from 'react';
import { HOUSEKEEPING } from '../../../../cli-app/summary/housekeeping.ts';
import { FileText } from 'lucide-react';
import { useLens } from '../../../store.ts';
import { listModel } from '../../../model/summaryList.ts';
import { showOverview, toggleFlow } from '../../../actions/summary.ts';
import { plural } from '../../../shared.ts';
import { Kbd } from '../../../../ui/Kbd.tsx';
import { SignalChips } from './SignalChips.tsx';
import { UnitItem } from './UnitItem.tsx';
import { FileGroupItem } from './FileGroupItem.tsx';
import { ListRow } from '../../../../ui/ListRow.tsx';
import { Disclosure } from '../../../../ui/Disclosure.tsx';
import { stepHeadings } from './util.ts';
import { InboxRail } from './InboxRail/index.tsx';

/**
 * The Summary tab's list: flows (the agent's priority orders them), then the changes in no flow, by file;
 * or, with the inbox on, the same as sections of cards (InboxRail).
 */
export function SummaryList() {
  const { list, overview } = useLens((state) => ({ list: listModel(state)!, overview: state.summaryUnit === null }));
  const isActive = (unitId: string) => !overview && unitId === list.activeId;

  return (
    <>
      <ListRow
        selected={overview}
        data-part='sum-overview-item'
        data-active={overview || undefined}
        className='group/overview mb-1 flex w-full items-center gap-2 px-2 py-1 font-medium [&_[data-part=kbd-combo]]:ml-auto'
        onClick={showOverview}
      >
        <FileText size={14} className='group-data-active/overview:text-accent' />
        Overview
        <Kbd combo='g' />
      </ListRow>
      <SignalChips counts={list.counts} signal={list.signal} />
      {list.inbox && <InboxRail flows={list.inbox} isActive={isActive} />}
      {!list.inbox &&
        list.sections.map(({ flow, members }) => {
          const folded = list.folded.has(flow.title);
          const headings = stepHeadings(flow, members);
          return (
            <div
              key={'flow:' + flow.title}
              data-part='sum-section'
              data-folded={folded || undefined}
              className='group/section pt-2 pb-1'
            >
              {/* the flow's name and why it matters: the agent's priority only orders the flows (P3 starts folded) */}
              <Disclosure
                data-part='sum-section-title'
                data-flow=''
                open={!folded}
                className='flex w-full min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 px-2 py-1 text-left'
                title={folded ? flow.why : undefined}
                onClick={() => toggleFlow(flow.title, folded)}
              >
                <span
                  data-part='t'
                  className='min-w-0 font-serif text-lg/[1.3] font-bold [overflow-wrap:anywhere] text-text group-data-folded/section:text-muted'
                >
                  {flow.title}
                </span>
                {folded && (
                  <span data-part='sub' className='inline-flex items-center gap-1 text-xs whitespace-nowrap text-faint'>
                    {plural(members.length, 'change')}
                  </span>
                )}
              </Disclosure>
              {!folded && flow.why && (
                <div data-part='sum-section-why' className='px-2 pb-1 text-xs/[1.4] text-muted'>
                  {flow.why}
                </div>
              )}
              {!folded &&
                members.map((unit) => (
                  <Fragment key={unit.id}>
                    {headings.has(unit.id) && (
                      <div data-part='sum-step' className='px-2 pt-2 pb-1 eyebrow sm'>
                        {headings.get(unit.id)}
                      </div>
                    )}
                    <UnitItem unit={unit} active={isActive(unit.id)} />
                  </Fragment>
                ))}
            </div>
          );
        })}
      {!list.inbox && list.otherFiles.length > 0 && (
        <div data-part='sum-section' className='pt-2 pb-1'>
          {/* Housekeeping alone is lens's own, not a story: no heading to set the rest apart from it */}
          {list.sections.some((section) => section.flow.title !== HOUSEKEEPING) && (
            <div
              data-part='sum-section-title'
              className='flex w-full min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 px-2 py-1 text-left'
            >
              <span
                data-part='t'
                className='min-w-0 font-serif text-base/[1.3] font-bold [overflow-wrap:anywhere] text-text'
              >
                Not in a story
              </span>
            </div>
          )}
          {list.otherFiles.map((group) => (
            <FileGroupItem
              key={'file:' + group.file}
              group={group}
              folded={list.foldedFiles.has(group.file)}
              isActive={isActive}
            />
          ))}
        </div>
      )}
      {list.shownCount === 0 && <div className='no-match'>no changes match the filter</div>}
    </>
  );
}
