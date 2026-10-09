import { type Marks, signalTip, type Unit, unitSignals } from '../model/signals.ts';
import { SignalIcon } from './SignalIcon.tsx';

interface SignalMarkerProps {
  marks: Marks;
  unit: Unit;
}

/** The marker before a unit's name: its most serious signal, or an empty span. */
export function SignalMarker({ marks, unit }: SignalMarkerProps) {
  const topSignal = unitSignals(marks, unit)[0];
  if (!topSignal) return <span />;
  return (
    <span className={'sig sig-' + topSignal} title={signalTip(marks, unit, topSignal)}>
      <SignalIcon signal={topSignal} size={11} />
    </span>
  );
}
