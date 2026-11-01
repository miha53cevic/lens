import { Fragment } from 'react';
import clsx from 'clsx';

const MODIFIERS = new Set(['⌘', '⇧', '⌥', '⌃']);

/** A shortcut's parts: "Ctrl P" → Ctrl, P; "⌘⇧P" → ⌘, ⇧, P; "⌥ click" → ⌥, then the word "click" as text. */
function parts(combo: string): { key: string; text?: boolean }[] {
  return combo.split(' ').flatMap((part): { key: string; text?: boolean }[] => {
    if (part.length > 1 && MODIFIERS.has(part[0])) return [{ key: part[0] }, ...parts(part.slice(1))];
    // a word like "click" is how to press, not a key
    return [{ key: part, text: part.length > 1 && /^[a-z]+$/.test(part) }];
  });
}

/** A keyboard shortcut, each key a keycap: md beside a control, sm in a line of small text (a hint). */
export function Kbd({ combo, size = 'md' }: { combo: string; size?: 'md' | 'sm' }) {
  return (
    <span
      data-part='kbd-combo'
      data-size={size}
      className={clsx(
        'inline-flex items-center gap-1 align-middle whitespace-nowrap',
        size === 'sm' && '[&_kbd]:h-[18px] [&_kbd]:min-w-[18px] [&_kbd]:px-1',
      )}
    >
      {parts(combo).map((part, partIndex) => (
        <Fragment key={partIndex}>
          {part.text ? (
            <span>{part.key}</span>
          ) : (
            // a lowercase letter centers on its x-height, everything else on the capitals
            <kbd className={/^[a-z]$/.test(part.key) ? 'lower' : undefined}>{part.key}</kbd>
          )}
        </Fragment>
      ))}
    </span>
  );
}
