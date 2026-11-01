import type { InboxFlow } from '../../../../model/inbox.ts';
import { FlowSection } from './FlowSection.tsx';

interface InboxRailProps {
  flows: InboxFlow[];
  isActive: (unitId: string) => boolean;
}

/** The Summary list as an inbox (⋯ → Summary): each flow a section of cards, the read ones folded under them. */
export function InboxRail({ flows, isActive }: InboxRailProps) {
  return (
    <div data-part='inbox-rail' className='relative mt-3 flex flex-col gap-3'>
      {flows.map((flow) => (
        <FlowSection key={'flow:' + flow.key} flow={flow} isActive={isActive} />
      ))}
      {/* where a card that left draws as it drops away (ui/motion.ts flip): React keeps it empty */}
      <div data-part='inbox-ghosts' className='pointer-events-none absolute inset-0' aria-hidden='true' />
    </div>
  );
}
