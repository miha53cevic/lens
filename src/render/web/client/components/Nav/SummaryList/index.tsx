import { ChevronRight, FileText } from 'lucide-react';
import clsx from 'clsx';
import { useLens } from '../../../store.ts';
import { listModel } from '../../../model/summaryList.ts';
import { showOverview, toggleFlow } from '../../../actions/summary.ts';
import { baseName, plural } from '../../../shared.ts';
import { FlowPriority } from '../../FlowPriority.tsx';
import { SignalChips } from './SignalChips.tsx';
import { UnitItem } from './UnitItem.tsx';

/** The Summary tab's list: flows by priority, then the changes in no flow. */
export function SummaryList() {
  const { list, overview } = useLens((state) => ({ list: listModel(state)!, overview: state.summaryOverview }));
  const isActive = (unitId: string) => !overview && unitId === list.activeId;

  return (
    <>
      <button
        className={clsx('sum-overview-item', overview && 'active')}
        title='the whole diff at a glance (g)'
        onClick={showOverview}
      >
        <FileText size={14} className='ico' />
        Overview
        <kbd>g</kbd>
      </button>
      <SignalChips counts={list.counts} signal={list.signal} />
      {list.sections.map(({ flow, members }) => {
        const folded = list.folded.has(flow.title);
        return (
          <div key={'flow:' + flow.title} className={clsx('sum-section', folded && 'folded')}>
            <button
              className='sum-section-title flow'
              data-flow={flow.title}
              aria-expanded={!folded}
              title={flow.title + ' — ' + flow.path + (flow.why ? '\n' + flow.why : '')}
              onClick={() => toggleFlow(flow.title, folded)}
            >
              <ChevronRight className={clsx('caret', !folded && 'open')} size={12} />
              <FlowPriority flow={flow} />
              {/* the whole title, wrapped, with the path under it: a cut-off title says nothing */}
              <span className='flow-name'>
                <span className='t'>{flow.title}</span>
                <span className='sub'>{folded ? plural(members.length, 'change') : flow.path}</span>
              </span>
            </button>
            {flow.why && !folded && <div className='sum-why'>{flow.why}</div>}
            {!folded &&
              members.map((unit) => (
                <UnitItem key={unit.id} unit={unit} side={flow.units[unit.id]} active={isActive(unit.id)} />
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
            <UnitItem key={unit.id} unit={unit} side={baseName(unit.displayFile)} active={isActive(unit.id)} />
          ))}
        </div>
      )}
      {list.shownCount === 0 && <div className='no-match'>no changes match the filter</div>}
    </>
  );
}
