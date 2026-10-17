import { Fragment } from 'react';
import { ChevronRight, FileText } from 'lucide-react';
import clsx from 'clsx';
import { useLens } from '../../../store.ts';
import { listModel } from '../../../model/summaryList.ts';
import { showOverview, toggleFlow } from '../../../actions/summary.ts';
import { baseName, plural } from '../../../shared.ts';
import { Kbd } from '../../../../ui/Kbd.tsx';
import { SignalChips } from './SignalChips.tsx';
import { UnitItem } from './UnitItem.tsx';
import { stepHeadings } from './util.ts';

/** The Summary tab's list: flows (the agent's priority orders them), then the changes in no flow. */
export function SummaryList() {
  const { list, overview } = useLens((state) => ({ list: listModel(state)!, overview: state.summaryUnit === null }));
  const isActive = (unitId: string) => !overview && unitId === list.activeId;

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
        const headings = stepHeadings(flow, members);
        return (
          <div key={'flow:' + flow.title} className={clsx('sum-section', folded && 'folded')}>
            {/* the flow's name and why it matters: the agent's priority only orders the flows (P3 starts folded) */}
            <button
              className='sum-section-title flow'
              aria-expanded={!folded}
              title={folded ? flow.why : undefined}
              onClick={() => toggleFlow(flow.title, folded)}
            >
              <span className='t'>{flow.title}</span>
              {folded && (
                <span className='sub'>
                  {plural(members.length, 'change')} <ChevronRight size={11} />
                </span>
              )}
            </button>
            {!folded && flow.why && <div className='sum-section-why'>{flow.why}</div>}
            {!folded &&
              members.map((unit) => (
                <Fragment key={unit.id}>
                  {headings.has(unit.id) && <div className='sum-step'>{headings.get(unit.id)}</div>}
                  <UnitItem unit={unit} active={isActive(unit.id)} />
                </Fragment>
              ))}
          </div>
        );
      })}
      {list.others.length > 0 && (
        <div className='sum-section'>
          {list.sections.length > 0 && (
            <div className='sum-section-title'>
              <span className='t'>Not in a story</span>
            </div>
          )}
          {list.others.map((unit) => (
            <UnitItem key={unit.id} unit={unit} side={baseName(unit.displayFile)} active={isActive(unit.id)} />
          ))}
        </div>
      )}
      {list.shownCount === 0 && <div className='no-match'>no changes match the filter</div>}
    </>
  );
}
