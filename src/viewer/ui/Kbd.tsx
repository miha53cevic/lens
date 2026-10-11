import { Fragment } from 'react';
import './Kbd.css';

const MODIFIERS = new Set(['⌘', '⇧', '⌥', '⌃']);

/** A shortcut's parts: "Ctrl P" → Ctrl, P; "⌘P" → ⌘, P; "⌥ click" → ⌥, then the word "click" as text. */
function parts(combo: string): { key: string; text?: boolean }[] {
  return combo.split(' ').flatMap((part) => {
    if (part.length > 1 && MODIFIERS.has(part[0])) return [{ key: part[0] }, { key: part.slice(1) }];
    // a word like "click" is how to press, not a key
    return [{ key: part, text: part.length > 1 && /^[a-z]+$/.test(part) }];
  });
}

/** A keyboard shortcut, each key a keycap. */
export function Kbd({ combo }: { combo: string }) {
  return (
    <span className='kbd-combo'>
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
