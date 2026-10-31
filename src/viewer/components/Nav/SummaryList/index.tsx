import { Fragment } from 'react';
import { HOUSEKEEPING } from '../../../../cli-app/summary/housekeeping.ts';
import { FileText } from 'lucide-react';
import clsx from 'clsx';
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
      <ListRow selected={overview} className={clsx('sum-overview-item', overview && 'active')} onClick={showOverview}>
        <FileText size={14} className='ico' />
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
            <div key={'flow:' + flow.title} className={clsx('sum-section', folded && 'folded')}>
              {/* the flow's name and why it matters: the agent's priority only orders the flows (P3 starts folded) */}
              <Disclosure
                open={!folded}
                className='sum-section-title flow'
                title={folded ? flow.why : undefined}
                onClick={() => toggleFlow(flow.title, folded)}
              >
                <span className='t'>{flow.title}</span>
                {folded && <span className='sub'>{plural(members.length, 'change')}</span>}
              </Disclosure>
              {!folded && flow.why && <div className='sum-section-why'>{flow.why}</div>}
              {!folded &&
                members.map((unit) => (
                  <Fragment key={unit.id}>
                    {headings.has(unit.id) && <div className='sum-step eyebrow sm'>{headings.get(unit.id)}</div>}
                    <UnitItem unit={unit} active={isActive(unit.id)} />
                  </Fragment>
                ))}
            </div>
          );
        })}
      {!list.inbox && list.otherFiles.length > 0 && (
        <div className='sum-section'>
          {/* Housekeeping alone is lens's own, not a story: no heading to set the rest apart from it */}
          {list.sections.some((section) => section.flow.title !== HOUSEKEEPING) && (
            <div className='sum-section-title'>
              <span className='t'>Not in a story</span>
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
