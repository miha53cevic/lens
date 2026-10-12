import type { CSSProperties } from 'react';
import './Swatch.css';

interface SwatchProps {
  /** A theme's background and accent. Without them: the theme the page is in. */
  bg?: string;
  accent?: string;
}

/** A code theme at a glance: its background and its accent, split on the diagonal. */
export function Swatch({ bg, accent }: SwatchProps) {
  const style = bg ? ({ '--swatch-bg': bg, color: accent } as CSSProperties) : undefined;
  return <span className='swatch' style={style} />;
}
