import type { Flow } from '../../../../summary/store.ts';
import { flowPriority } from '../model/signals.ts';

const PRIORITY_TIPS: Record<number, string> = {
  1: 'review first',
  2: 'normal priority',
  3: 'mechanical — folded by default',
};

/** A flow's priority tag: P1 … P3. */
export function FlowPriority({ flow }: { flow: Flow }) {
  const priority = flowPriority(flow);
  return (
    <span className={'prio p' + priority} title={'P' + priority + ': ' + PRIORITY_TIPS[priority]}>
      P{priority}
    </span>
  );
}
