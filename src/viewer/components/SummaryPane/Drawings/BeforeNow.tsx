import { Segmented } from '../../../../ui/Segmented.tsx';

export type Moment = 'before' | 'now';

const MOMENTS: { value: Moment; label: string }[] = [
  { value: 'before', label: 'Before' },
  { value: 'now', label: 'Now' },
];

/** Before | Now, in a drawing's header. */
export function BeforeNow({ value, onChange }: { value: Moment; onChange: (moment: Moment) => void }) {
  return <Segmented label='before or now' options={MOMENTS} value={value} onChange={onChange} />;
}
