/**
 * The stretch of the code in sight, for the ruler's thumb: --view-top and --view-h on the card,
 * fractions of the whole. Kept by the scroll and by the code's size changing (a fold opened), never
 * by a render. A ref callback's work: what it returns stops it.
 */
export function trackView(body: HTMLElement): () => void {
  const card = body.closest<HTMLElement>('[data-part="code-card"]');
  const update = () => {
    const whole = body.scrollHeight || 1;
    card?.style.setProperty('--view-top', String(body.scrollTop / whole));
    card?.style.setProperty('--view-h', String(Math.min(1, body.clientHeight / whole)));
  };
  update();
  body.addEventListener('scroll', update, { passive: true });
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
  observer?.observe(body);
  if (body.firstElementChild) observer?.observe(body.firstElementChild);
  return () => {
    body.removeEventListener('scroll', update);
    observer?.disconnect();
  };
}
