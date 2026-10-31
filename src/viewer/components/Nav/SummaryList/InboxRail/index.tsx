import type { InboxFlow } from '../../../../model/inbox.ts';
import { FlowSection } from './FlowSection.tsx';
import './style.css';

interface InboxRailProps {
  flows: InboxFlow[];
  isActive: (unitId: string) => boolean;
}

/** The Summary list as an inbox (⋯ → Summary): each flow a section of cards, the read ones folded under them. */
export function InboxRail({ flows, isActive }: InboxRailProps) {
  return (
    <div className='inbox-rail'>
      {flows.map((flow) => (
        <FlowSection key={'flow:' + flow.key} flow={flow} isActive={isActive} />
      ))}
      {/* where a card that left draws as it drops away (ui/motion.ts flip): React keeps it empty */}
      <div className='inbox-ghosts' aria-hidden='true' />
    </div>
  );
}
