import { ArrowUpRight, CircleAlert, CircleHelp, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import type { SignalFilter } from '../store.ts';

const ICONS: Record<Exclude<NonNullable<SignalFilter>, 'any'>, LucideIcon> = {
  bug: TriangleAlert,
  risk: CircleAlert,
  question: CircleHelp,
  breaks: ArrowUpRight,
  dismissed: X,
};

interface SignalIconProps {
  signal: keyof typeof ICONS;
  size?: number;
  /** the reader marked it real: a green dot on the icon's corner, green as the Real button is */
  confirmed?: boolean;
}

/** A signal's icon: ⚠ bug, ! risk, ? question, ↗ breaks callers, ✕ dismissed. */
export function SignalIcon({ signal, size = 12, confirmed = false }: SignalIconProps) {
  const Icon = ICONS[signal];
  if (!confirmed) return <Icon size={size} strokeWidth={2.4} aria-hidden />;
  // the dot sits past the glyph's corner, where every icon's strokes leave room; mr-1 keeps it off the next icon
  return (
    <span data-part='sig-icon' data-confirmed='' className='relative mr-1 inline-flex'>
      <Icon size={size} strokeWidth={2.4} aria-hidden />
      <span className='dot absolute -top-1 -right-1 [--dot:var(--add)]' />
    </span>
  );
}
