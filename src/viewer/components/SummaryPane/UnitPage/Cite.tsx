import { flashCited } from '../../../actions/summary.ts';

/** A cite: "L31" (a new-side line) or "−16" (a removed one); a click shows it in the code below. */
export function Cite({ label }: { label: string }) {
  return (
    <button className='cite' data-line={label} onClick={() => flashCited(label)}>
      {label.startsWith('O') ? '−' + label.slice(1) : 'L' + label.slice(1)}
    </button>
  );
}
