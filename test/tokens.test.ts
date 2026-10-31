// The design system's rules, held by the suite: a stylesheet takes its colors, type sizes, spaces,
// radii, shadows and layers from src/ui/styles/tokens.css, and writes none of its own.

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { relPath } from '../src/cli-app/paths.ts';
import { CODE_SIZE_DEFAULT } from '../src/viewer/codeSize.ts';
import { MOTION } from '../src/ui/motion.ts';

const ROOT = join(import.meta.dirname, '..');
const TOKENS = 'src/ui/styles/tokens.css';

function stylesheets(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return stylesheets(path);
    return name.endsWith('.css') ? [relPath(ROOT, path)] : [];
  });
}

interface Declaration {
  where: string;
  property: string;
  value: string;
}

/** Every `property: value` of the stylesheets but the tokens' own, comments left out. */
function declarations(): Declaration[] {
  const found: Declaration[] = [];
  for (const file of ['src/ui', 'src/viewer', 'src/desktop'].flatMap((folder) => stylesheets(join(ROOT, folder)))) {
    if (file === TOKENS) continue;
    // a comment keeps its line breaks, so the line numbers still point at the file
    const source = readFileSync(join(ROOT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, (comment) =>
      comment.replace(/[^\n]/g, ' '),
    );
    // the closing ; is left for the next declaration to start from
    const pattern = /(?:^|[;{}])\s*(-{0,2}[a-z][a-z-]*)\s*:\s*([^;{}]+)(?=;)/g;
    for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
      const line = source.slice(0, match.index + match[0].indexOf(match[1])).split('\n').length;
      found.push({ where: `${file}:${line}`, property: match[1], value: match[2].replace(/\s+/g, ' ').trim() });
    }
  }
  return found;
}

const DECLARATIONS = declarations();

/** The declarations a rule is broken by, as lines to read in a failure. */
function broken(isBroken: (declaration: Declaration) => boolean): string[] {
  return DECLARATIONS.filter(isBroken).map(({ where, property, value }) => `${where}  ${property}: ${value}`);
}

/** The scale's steps in px, read from tokens.css: `--space-1: 4px` → 4. */
function scale(prefix: string): number[] {
  const tokens = readFileSync(join(ROOT, TOKENS), 'utf8');
  return [...tokens.matchAll(new RegExp(`${prefix}-[a-z0-9]+: ([0-9.]+)px`, 'g'))].map((match) => Number(match[1]));
}

test('the stylesheets were found', () => {
  assert.ok(DECLARATIONS.length > 1500, `only ${DECLARATIONS.length} declarations read`);
});

test('no stylesheet writes a color of its own', () => {
  assert.deepEqual(
    broken(({ value }) => /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\(/i.test(value)),
    [],
  );
});

test('font sizes come from the type scale', () => {
  assert.deepEqual(
    broken(({ property, value }) => {
      if (property === 'font-size') return /\d(?:px|rem|em|pt)\b/.test(value);
      // in the shorthand the size is what comes before the line height or the family
      if (property === 'font') return /\d(?:px|rem|em|pt)\b/.test(value.split('/')[0]);
      return false;
    }),
    [],
  );
});

test('padding, margins and gaps are on the 4px grid, from the space scale', () => {
  const steps = scale('--space');
  assert.deepEqual(
    broken(({ property, value }) => {
      if (!/^(?:padding|margin)(?:-(?:top|right|bottom|left|inline|block))?$|^(?:row-|column-)?gap$/.test(property))
        return false;
      // where the system's own buttons sit is the system's number
      if (value.includes('env(')) return false;
      return [...value.matchAll(/(-?[0-9.]+)px/g)].some(([, px]) => {
        const size = Number(px);
        // off the grid, or a step the scale has a name for
        return size % 4 !== 0 || steps.includes(size);
      });
    }),
    [],
  );
});

test('corners come from the radius scale', () => {
  assert.deepEqual(
    broken(({ property, value }) => /radius$/.test(property) && /\d(?:px|%)/.test(value)),
    [],
  );
});

test('layers and lifts come from the tokens', () => {
  assert.deepEqual(
    broken(({ property, value }) => {
      if (property === 'z-index') return !/^var\(--z-[a-z]+\)$/.test(value);
      // a ring or an inset line is drawn with box-shadow too: only the page's shadow is an elevation
      if (property === 'box-shadow') return value.includes('var(--shadow)');
      return false;
    }),
    [],
  );
});

test('a label in capitals is spaced by the token', () => {
  // a display title may be drawn tighter (a negative spacing); anything spaced out is .eyebrow's
  assert.deepEqual(
    broken(
      ({ property, value }) =>
        property === 'letter-spacing' && !value.startsWith('-') && value !== 'var(--tracking-caps)',
    ),
    [],
  );
});

test('a tinted border takes its strength from the tokens', () => {
  assert.deepEqual(
    broken(({ property, value }) => /^border(?:-[a-z]+)*$/.test(property) && /color-mix\([^)]*\) [0-9.]+%/.test(value)),
    [],
  );
});

test("the viewer's default code size is the token's", () => {
  assert.match(readFileSync(join(ROOT, TOKENS), 'utf8'), new RegExp(`--text-code: ${CODE_SIZE_DEFAULT}px;`));
});

test("a size by the window's is --screen-w or --screen-h, which the UI's zoom doesn't stretch", () => {
  assert.deepEqual(
    broken(({ value }) => /\d(?:d|s|l)?(?:vh|vw|vmin|vmax)\b/.test(value)),
    [],
  );
});

test('transitions take their timing from the motion tokens', () => {
  // a delay is a wait, not a motion (the 150 ms before a loading screen shows): it may be its own
  assert.deepEqual(
    broken(
      ({ property, value }) =>
        /^transition(-duration|-timing-function)?$/.test(property) &&
        /\d(m?s)\b|cubic-bezier|\bease\b|ease-(in|out)\b|linear/.test(value),
    ),
    [],
  );
});

test('what script animates moves as the motion tokens do', () => {
  const tokens = readFileSync(join(ROOT, TOKENS), 'utf8');
  assert.match(tokens, new RegExp(`--motion-enter: ${MOTION.enter}ms var\\(--ease-out\\);`));
  assert.match(tokens, new RegExp(`--motion-exit: ${MOTION.exit}ms var\\(--ease-in\\);`));
  assert.match(tokens, new RegExp(`--motion-move: ${MOTION.move}ms var\\(--ease-out\\);`));
  assert.ok(tokens.includes(`--ease-out: ${MOTION.easeOut};`));
  assert.ok(tokens.includes(`--ease-in: ${MOTION.easeIn};`));
});

test('the retired tokens stay retired', () => {
  assert.deepEqual(
    broken(({ value }) => /var\(--accent-soft\)/.test(value)),
    [],
  );
});
