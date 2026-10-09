import { type Marks, SIGNALS, signalTip, type Unit, unitSignals } from '../model/signals.ts';

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
      {SIGNALS[topSignal].icon}
    </span>
  );
}
