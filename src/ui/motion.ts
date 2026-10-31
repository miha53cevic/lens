// Motion that only script can start: an element that just mounted (not one shown again after
// display: none), a panel the reader just opened, a mark they just made, a theme switch. CSS does
// the rest (transitions, @starting-style). Nothing here runs before the page has settled, with less
// motion asked for, or where the browser can't animate (the page tests' happy-dom).

/** The tokens' numbers (tokens.css: --motion-enter, --motion-exit, --motion-move, --ease-out, --ease-in). */
export const MOTION = {
  enter: 180,
  exit: 110,
  move: 220,
  easeOut: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
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

// What leaves plays out first, and the change that takes it away runs after: React removes or hides
// an element in the same frame its state changes, which leaves nothing to animate. With no motion the
// change runs at once, so the page tests see the end state.

/** The exits still playing, and the change each runs at its end. */
interface Exit {
  animation: Animation;
  then: () => void;
  hold: boolean;
}
const leaving = new WeakMap<Element, Exit>();

/**
 * Plays `keyframes` out on `element`, then runs `then`. Called again while it plays, `then` runs at
 * once (a second Esc doesn't wait). With `hold`, the last frame stays until the element is gone: for
 * a change that lands later (the desktop strip hears its tabs from the main process).
 */
function leave(element: Element | null, keyframes: Keyframe[], then: () => void, hold = false): void {
  const running = element && leaving.get(element);
  if (running) return finish(element, running);
  const animation = animate(element, keyframes, MOTION.exit, MOTION.easeIn);
  if (!element || !animation) return then();
  const exit = { animation, then, hold };
  leaving.set(element, exit);
  if (hold) animation.effect?.updateTiming({ fill: 'forwards' });
  if (element instanceof HTMLElement) element.style.pointerEvents = 'none';
  void animation.finished.then(
    () => finish(element, exit),
    () => {},
  );
}

function finish(element: Element, exit: Exit): void {
  if (leaving.get(element) !== exit) return;
  leaving.delete(element);
  exit.then();
  if (element instanceof HTMLElement) element.style.pointerEvents = '';
  if (!exit.hold) return exit.animation.cancel();
  // held, and the element is still there a while after its change: it wasn't taken out after all
  setTimeout(() => element.isConnected && exit.animation.cancel(), 1000);
}

/** An exit still playing on `element` is called off, and it stays where it was. True when there was one. */
export function stay(element: Element | null): boolean {
  const running = element && leaving.get(element);
  if (!element || !running) return false;
  leaving.delete(element);
  running.animation.cancel();
  if (element instanceof HTMLElement) element.style.pointerEvents = '';
  return true;
}

/** `slideIn` played back: a panel slides out past its edge, and what is beside it takes the room, then `then` hides it. */
export function slideOut(element: Element | null, edge: 'left' | 'right', then: () => void): void {
  if (!(element instanceof HTMLElement) || !element.offsetWidth) return then();
  const margin = edge === 'left' ? 'marginLeft' : 'marginRight';
  leave(element, [{ [margin]: '0px' }, { [margin]: -element.offsetWidth + 'px' }], then);
}

/** `growOpen` played back: what the reader closes shrinks to nothing under what closed it, then `then` takes it out. */
export function growClosed(element: Element | null, then: () => void): void {
  if (!(element instanceof HTMLElement) || !element.offsetWidth) return then();
  leave(
    element,
    [
      { height: element.offsetHeight + 'px', opacity: 1, overflow: 'hidden' },
      { height: '0px', opacity: 0, overflow: 'hidden' },
    ],
    then,
  );
}

/**
 * `widenIn` played back: a tab that closes narrows out of its place, so the ones beside it move over.
 * With `hold` it stays narrowed until the change that removes it lands.
 */
export function narrowOut(element: Element | null, then: () => void, hold = false): void {
  if (!(element instanceof HTMLElement) || !element.offsetWidth) return then();
  leave(
    element,
    [
      { maxWidth: element.offsetWidth + 'px', opacity: 1, overflow: 'hidden' },
      {
        maxWidth: '0px',
        opacity: 0,
        overflow: 'hidden',
        paddingInline: '0px',
        marginInline: '0px',
        borderWidth: '0px',
      },
    ],
    then,
    hold,
  );
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
