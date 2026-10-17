// Motion that only script can start: an element that just mounted (not one shown again after
// display: none), a panel the reader just opened, a mark they just made, a theme switch. CSS does
// the rest (transitions, @starting-style). Nothing here runs before the page has settled, with less
// motion asked for, or where the browser can't animate (the page tests' happy-dom).

/** The tokens' numbers (tokens.css: --motion-enter, --motion-exit, --motion-move, --ease-out). */
export const MOTION = {
  enter: 180,
  exit: 110,
  move: 220,
  easeOut: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
} as const;

/** The class on <html> once the page has settled: CSS's entrances wait for it too. */
const READY_CLASS = 'motion';

/**
 * The page has drawn what it opened with: from the next frames on, what appears may animate.
 * What the page arrives with never does.
 */
export function motionReady(): void {
  const root = document.documentElement;
  if (root.classList.contains(READY_CLASS)) return;
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add(READY_CLASS)));
}

function motionAllowed(): boolean {
  if (!document.documentElement.classList.contains(READY_CLASS)) return false;
  return typeof matchMedia !== 'function' || !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function animate(element: Element | null, keyframes: Keyframe[], duration: number, easing: string = MOTION.easeOut) {
  if (!(element instanceof HTMLElement || element instanceof SVGElement)) return null;
  if (typeof element.animate !== 'function' || !motionAllowed()) return null;
  return element.animate(keyframes, { duration, easing });
}

/** A ref callback: what just mounted rises into place (a message, a status). */
export function riseIn(element: Element | null): void {
  animate(
    element,
    [
      { opacity: 0, translate: '0 6px' },
      { opacity: 1, translate: '0 0' },
    ],
    MOTION.enter,
  );
}

/** A ref callback: what just mounted fades in where it stands (an answer, a screen). */
export function fadeIn(element: Element | null): void {
  animate(element, [{ opacity: 0 }, { opacity: 1 }], MOTION.move);
}

/** A ref callback: a tab that just opened widens into its place, so the ones beside it move over. */
export function widenIn(element: Element | null): void {
  if (!(element instanceof HTMLElement)) return;
  const width = element.offsetWidth;
  if (!width) return;
  const animation = animate(
    element,
    [
      { maxWidth: '0px', opacity: 0 },
      { maxWidth: width + 'px', opacity: 1 },
    ],
    MOTION.enter,
  );
  if (!animation) return;
  element.style.overflow = 'hidden';
  const done = () => (element.style.overflow = '');
  void animation.finished.then(done, done);
}

/** What the reader just opened grows from nothing to its height, under what opened it (a folder's files). */
export function growOpen(element: Element | null): void {
  if (!(element instanceof HTMLElement)) return;
  const height = element.offsetHeight;
  if (!height) return;
  const animation = animate(
    element,
    [
      { height: '0px', opacity: 0 },
      { height: height + 'px', opacity: 1 },
    ],
    MOTION.move,
  );
  if (!animation) return;
  element.style.overflow = 'hidden';
  const done = () => (element.style.overflow = '');
  void animation.finished.then(done, done);
}

/** A panel that was just shown slides in from its edge of the page, and what is beside it makes room. */
export function slideIn(element: Element | null, edge: 'left' | 'right'): void {
  if (!(element instanceof HTMLElement)) return;
  const margin = edge === 'left' ? 'marginLeft' : 'marginRight';
  animate(element, [{ [margin]: -element.offsetWidth + 'px' }, { [margin]: '0px' }], MOTION.move);
}

/** Something the reader just did, done: a short swell (the review pill, the ring at 100%). */
export function pop(element: Element | null): void {
  animate(element, [{ scale: 1 }, { scale: 1.06, offset: 0.4 }, { scale: 1 }], 320);
}

/** Changes the page in `change` (synchronously), cross-fading from how it looked before. */
export function crossFade(change: () => void): void {
  if (typeof document.startViewTransition !== 'function' || !motionAllowed()) {
    change();
    return;
  }
  document.startViewTransition(change);
}
