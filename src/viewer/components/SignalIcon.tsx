import { ArrowUpRight, CircleAlert, CircleHelp, CircleSmall, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import type { SignalFilter } from '../store.ts';

const ICONS: Record<Exclude<NonNullable<SignalFilter>, 'any'>, LucideIcon> = {
  bug: TriangleAlert,
  risk: CircleAlert,
  question: CircleHelp,
  breaks: ArrowUpRight,
  look: CircleSmall,
  dismissed: X,
};

/** A signal's icon: ⚠ bug, ! risk, ? question, ↗ breaks callers, ● flagged without a reason, ✕ dismissed. */
export function SignalIcon({ signal, size = 12 }: { signal: keyof typeof ICONS; size?: number }) {
  const Icon = ICONS[signal];
  return <Icon size={size} strokeWidth={2.4} aria-hidden />;
}
