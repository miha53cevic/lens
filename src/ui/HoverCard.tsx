// A card about what is under the pointer, next to it: what a name in the code is (TypeScript's
// hover). Unlike a menu it takes no focus and closes nothing else (a manual popover), and its
// owner opens and closes it. Mounted only while shown, keyed by its anchor: a new anchor is a new card.
// Each child is a section, ruled off from the next (the declaration, then its doc).

import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn.ts';
import { cssPx } from './zoom.ts';

/** What the card sits against, in screen px as getBoundingClientRect gives them */
export interface HoverAnchor {
  left: number;
  top: number;
  bottom: number;
}

interface HoverCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'popover'> {
  anchor: HoverAnchor;
  children: ReactNode;
}

/** px between the anchor and the card, and the card and the window's edge */
const GAP = 4;
const MARGIN = 8;

export function HoverCard({ anchor, className, children, ...props }: HoverCardProps) {
  return (
    <div
      ref={(card) => {
        if (!card) return;
        card.showPopover?.(); // happy-dom has no popovers: the card is read where it is
        place(card, anchor);
      }}
      popover='manual'
      data-part='hover-card'
      {...props}
      className={cn(
        // on a light theme the raised color is the code's own: the paper tone sets the card off it
        'fixed inset-auto m-0 flex max-h-[min(360px,calc(var(--screen-h)-16px))] max-w-[min(600px,calc(var(--screen-w)-16px))] flex-col divide-y divide-line overflow-auto rounded-md border border-line-strong bg-raised text-sm text-text shadow-2 light:bg-bg [&>*]:px-3 [&>*]:py-2',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Under the anchor, or over it when there's no room below; inside the window either way */
function place(card: HTMLElement, anchor: HoverAnchor) {
  const { width, height } = card.getBoundingClientRect();
  const [left, top, bottom, screenW, screenH, cardW, cardH] = [
    anchor.left,
    anchor.top,
    anchor.bottom,
    window.innerWidth,
    window.innerHeight,
    width,
    height,
  ].map(cssPx);
  card.style.left = Math.max(MARGIN, Math.min(left, screenW - cardW - MARGIN)) + 'px';
  const below = bottom + GAP;
  card.style.top = (below + cardH <= screenH - MARGIN ? below : Math.max(MARGIN, top - GAP - cardH)) + 'px';
}
