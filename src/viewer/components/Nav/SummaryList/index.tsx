import { FileText } from 'lucide-react';
import { useLens } from '../../../store.ts';
import { listModel } from '../../../model/summaryList.ts';
import { showOverview } from '../../../actions/summary.ts';
import { Kbd } from '../../../../ui/Kbd.tsx';
import { SignalChips } from './SignalChips.tsx';
import { ListRow } from '../../../../ui/ListRow.tsx';
import { InboxRail } from './InboxRail/index.tsx';

/** The Summary tab's list: each flow (the agent's priority orders them) a section of cards, then the changes in no flow. */
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
      <InboxRail flows={list.inbox} isActive={isActive} />
      {list.shownCount === 0 && <div className='no-match'>no changes match the filter</div>}
    </>
  );
}
