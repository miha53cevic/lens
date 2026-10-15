import { ChevronRight, FileText } from 'lucide-react';
import clsx from 'clsx';
import { useLens } from '../../../store.ts';
import { listModel } from '../../../model/summaryList.ts';
import { showOverview, toggleFlow } from '../../../actions/summary.ts';
import { baseName, plural } from '../../../shared.ts';
import { Kbd } from '../../../../ui/Kbd.tsx';
import { SignalChips } from './SignalChips.tsx';
import { UnitItem } from './UnitItem.tsx';

/** The Summary tab's list: flows (the agent's priority orders them), then the changes in no flow. */
export function SummaryList() {
  const { list, overview } = useLens((state) => ({ list: listModel(state)!, overview: state.summaryUnit === null }));
  // a unit in several flows is listed under each: only the listing the reader picked is marked (and scrolled to)
  const isActive = (unitId: string, flow: string | null) =>
    !overview && unitId === list.activeId && flow === list.activeFlow;

  return (
    <>
      <button className={clsx('sum-overview-item', overview && 'active')} onClick={showOverview}>
        <FileText size={14} className='ico' />
        Overview
        <Kbd combo='g' />
      </button>
      <SignalChips counts={list.counts} signal={list.signal} />
      {list.sections.map(({ flow, members }) => {
        const folded = list.folded.has(flow.title);
        return (
          <div key={'flow:' + flow.title} className={clsx('sum-section', folded && 'folded')}>
            {/* the flow's name, nothing else: the agent's priority only orders the flows (P3 starts folded) */}
            <button
              className='sum-section-title flow'
              aria-expanded={!folded}
              title={flow.why}
              onClick={() => toggleFlow(flow.title, folded)}
            >
              <span className='t'>{flow.title}</span>
              {folded && (
                <span className='sub'>
                  {plural(members.length, 'change')} <ChevronRight size={11} />
                </span>
              )}
            </button>
            {!folded &&
              members.map((unit) => (
                <UnitItem key={unit.id} unit={unit} flow={flow.title} active={isActive(unit.id, flow.title)} />
              ))}
          </div>
        );
      })}
      {list.others.length > 0 && (
        <div className='sum-section'>
          {list.sections.length > 0 && (
            <div className='sum-section-title'>
              <span className='t'>Other changes</span>
            </div>
          )}
          {list.others.map((unit) => (
            <UnitItem
              key={unit.id}
              unit={unit}
              flow={null}
              side={baseName(unit.displayFile)}
              active={isActive(unit.id, null)}
            />
          ))}
        </div>
      )}
      {list.shownCount === 0 && <div className='no-match'>no changes match the filter</div>}
    </>
  );
}
