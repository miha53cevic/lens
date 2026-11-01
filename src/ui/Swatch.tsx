import type { CSSProperties } from 'react';

interface SwatchProps {
  /** A theme's background and accent. Without them: the theme the page is in. */
  bg?: string;
  accent?: string;
}

/** A code theme at a glance: its background and its accent, split on the diagonal. Without colors, the page's own. */
export function Swatch({ bg, accent }: SwatchProps) {
  const style = bg ? ({ '--swatch-bg': bg, color: accent } as CSSProperties) : undefined;
  return (
    <span
      data-part='swatch'
      className='inline-block size-4 flex-none rounded-full border border-line-strong bg-[linear-gradient(135deg,var(--swatch-bg,var(--code-bg))_50%,currentColor_50%)] text-accent'
      style={style}
    />
  );
}
