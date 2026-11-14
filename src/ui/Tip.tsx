import { Kbd } from './Kbd.tsx';

/**
 * What a tooltip says: the text, then the key that does it. The page's one tooltip (tooltip.tsx)
 * shows it for any element with a `data-tip`; spread `tipAttrs` on one to give it one.
 */
export function Tip({ label, shortcut }: { label?: string; shortcut?: string }) {
  return (
    <>
      {label && <span className='min-w-0'>{label}</span>}
      {shortcut && <Kbd combo={shortcut} />}
    </>
  );
}

export interface TipOptions {
  /** Its key: a tooltip on a control is there to teach it */
  shortcut?: string;
  /** Which edge of the element the tooltip lines up with: start (the default), or end for controls on the right */
  side?: 'start' | 'end';
  /** Text that is cut off (a long path): the tooltip shows only while it is, with the whole of it */
  cut?: boolean;
}

/** The attributes that give an element a tooltip; none when there's nothing to say. */
export function tipAttrs(label: string | undefined | false, options: TipOptions = {}): Record<string, string> {
  if (!label && !options.shortcut) return {};
  const attrs: Record<string, string> = { 'data-tip': label || '' };
  if (options.shortcut) attrs['data-tip-key'] = options.shortcut;
  if (options.side === 'end') attrs['data-tip-side'] = 'end';
  if (options.cut) attrs['data-tip-cut'] = '';
  return attrs;
}
