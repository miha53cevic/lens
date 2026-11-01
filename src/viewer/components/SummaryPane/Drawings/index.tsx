// What the change looks like and what now happens: the agent's previews of the screens it changes,
// and its sequence diagrams. All of them on the overview; on a unit's page, the ones that show it.

import { useLens } from '../../../store.ts';
import { drawingsFor } from '../../../model/drawings.ts';
import { PreviewCard } from './PreviewCard.tsx';
import { SequenceCard } from './SequenceCard.tsx';

/** unitId: the unit page's unit, outlined in each drawing; null on the overview */
export function Drawings({ unitId }: { unitId: string | null }) {
  const { previews, sequences } = useLens((state) => drawingsFor(state.data.summary, state.data.buildPreviews, unitId));
  if (previews.length === 0 && sequences.length === 0) return null;
  return (
    <div
      className='flex flex-col gap-3 [&>[data-part=section-label]+[data-part=section-label]]:mt-2 [&>section+[data-part=section-label]]:mt-2'
      id='drawings'
    >
      <div data-part='section-label' className='eyebrow mb-1'>
        {previews.length > 0 ? 'Previews' : 'Sequences'}
      </div>
      {previews.map((preview) => (
        <PreviewCard key={preview.title} preview={preview} unitId={unitId} />
      ))}
      {previews.length > 0 && sequences.length > 0 && (
        <div data-part='section-label' className='eyebrow mb-1'>
          Sequences
        </div>
      )}
      {sequences.map((sequence) => (
        <SequenceCard key={sequence.title} sequence={sequence} unitId={unitId} />
      ))}
    </div>
  );
}
