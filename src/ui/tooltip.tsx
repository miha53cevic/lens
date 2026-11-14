// The page's one tooltip. Any element with a `data-tip` (tipAttrs in Tip.tsx) gets it on hover and
// on keyboard focus, after --tip-delay: one listener on the document, so it works on what React
// doesn't draw too (an answer's HTML). It sits in the top layer, so no scroll container clips it,
// and takes no focus. `data-tip-cut` shows it only while the element's text is cut off. A key's
// tip isn't shown on a disabled control: its key does nothing then.

import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { Tip } from './Tip.tsx';
import { cssPx } from './zoom.ts';

/** px between the element and the tip, and the tip and the window's edge */
const GAP = 8;
const MARGIN = 8;
/** Moving from one tip to the next within this long shows the next at once, as a menu bar does */
const WARM_MS = 300;

// resources of the page, not state: the one element, its React root and the timers
let tip: HTMLElement | null = null;
let root: Root | null = null;
let target: Element | null = null;
let showTimer: ReturnType<typeof setTimeout> | undefined;
let hiddenAt = 0;

/** Each page's entry calls it once, as it does motionReady(). */
export function installTooltips() {
  if (tip) return;
  tip = document.createElement('div');
  tip.id = 'lens-tooltip';
  tip.setAttribute('popover', 'manual');
  tip.setAttribute('role', 'tooltip');
  tip.dataset.part = 'tooltip';
  tip.className =
    'pointer-events-none fixed inset-auto m-0 inline-flex max-w-[min(480px,calc(var(--screen-w)-16px))] items-center gap-2 rounded-md border border-line-strong bg-raised py-1 pr-2 pl-3 font-sans text-sm/[1.3] font-normal text-text shadow-1 [overflow-wrap:anywhere] [transition:opacity_var(--motion),translate_var(--motion)] starting:opacity-0 starting:[translate:0_-3px]';
  document.body.append(tip);
  root = createRoot(tip);

  document.addEventListener('pointerover', (event) => over(event.target), true);
  document.addEventListener('focusin', (event) => {
    if (event.target instanceof Element && event.target.matches(':focus-visible')) over(event.target, true);
  });
  document.addEventListener('pointerout', (event) => {
    if (target && !(event.relatedTarget instanceof Node && target.contains(event.relatedTarget))) hide();
  });
  document.addEventListener('focusout', () => hide());
  document.addEventListener('pointerdown', () => hide(), true);
  document.addEventListener('scroll', () => hide(), true);
  document.addEventListener('keydown', (event) => event.key === 'Escape' && hide());
  window.addEventListener('blur', () => hide());
}

function over(from: EventTarget | null, now = false) {
  const element = from instanceof Element ? from.closest('[data-tip]') : null;
  if (element === target) return;
  hide();
  if (!element || !hasTip(element)) return;
  target = element;
  if (now || Date.now() - hiddenAt < WARM_MS) show(element);
  else showTimer = setTimeout(() => show(element), tipDelay());
}

function hasTip(element: Element): boolean {
  if (element.hasAttribute('data-tip-key') && element.matches(':disabled')) return false;
  if (!element.getAttribute('data-tip') && !element.getAttribute('data-tip-key')) return false;
  return !element.hasAttribute('data-tip-cut') || isCut(element);
}

/** Its text, or a child's, is wider than the box that shows it */
function isCut(element: Element): boolean {
  return [element, ...element.querySelectorAll('*')].some((part) => part.scrollWidth > part.clientWidth + 1);
}

function show(element: Element) {
  if (!tip || !root || !element.isConnected) return;
  const label = element.getAttribute('data-tip') || undefined;
  const shortcut = element.getAttribute('data-tip-key') || undefined;
  flushSync(() => root?.render(<Tip label={label} shortcut={shortcut} />));
  tip.dataset.open = 'true';
  tip.showPopover?.(); // happy-dom has no popovers: data-open says it's shown
  place(tip, element);
  element.setAttribute('aria-describedby', tip.id);
}

function hide() {
  clearTimeout(showTimer);
  if (target && tip?.dataset.open) {
    hiddenAt = Date.now();
    target.removeAttribute('aria-describedby');
  }
  target = null;
  if (!tip?.dataset.open) return;
  delete tip.dataset.open;
  if (tip.matches?.(':popover-open')) tip.hidePopover();
}

function tipDelay(): number {
  const delay = getComputedStyle(document.documentElement).getPropertyValue('--tip-delay');
  return parseFloat(delay) || 350;
}

/** Under the element, or over it when there's no room below; on its start edge (or end); inside the window */
function place(card: HTMLElement, element: Element) {
  const box = element.getBoundingClientRect();
  const size = card.getBoundingClientRect();
  const [left, right, top, bottom, screenW, screenH, cardW, cardH] = [
    box.left,
    box.right,
    box.top,
    box.bottom,
    window.innerWidth,
    window.innerHeight,
    size.width,
    size.height,
  ].map(cssPx);
  const start = element.getAttribute('data-tip-side') === 'end' ? right - cardW : left;
  card.style.left = Math.max(MARGIN, Math.min(start, screenW - cardW - MARGIN)) + 'px';
  const below = bottom + GAP;
  card.style.top = (below + cardH <= screenH - MARGIN ? below : Math.max(MARGIN, top - GAP - cardH)) + 'px';
}
