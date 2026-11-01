// The design system's rules, held by the suite: a stylesheet takes its colors, type sizes, spaces,
// radii, shadows and layers from src/ui/styles/tokens.css, and writes none of its own.

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { relPath } from '../src/cli-app/paths.ts';
import { CODE_SIZE_DEFAULT } from '../src/viewer/codeSize.ts';
import { MOTION } from '../src/ui/motion.ts';
import { bundlePage } from '../src/cli-app/render/web/bundle.ts';

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
  assert.ok(DECLARATIONS.length > 300, `only ${DECLARATIONS.length} declarations read`);
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

// Styling is Tailwind's: only what utilities can't say has a stylesheet.
test('only the tokens, the helpers, Tailwind and the code rows have a stylesheet', () => {
  const found = ['src/ui', 'src/viewer', 'src/desktop'].flatMap((folder) => stylesheets(join(ROOT, folder))).sort();
  assert.deepEqual(
    found,
    [
      'src/ui/styles/base.css',
      'src/ui/styles/tailwind.css',
      'src/ui/styles/tokens.css',
      'src/viewer/components/CodeRows/style.css',
    ].sort(),
  );
});

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) ? [relPath(ROOT, path)] : [];
  });
}

/** Every class written in a class string: a className, the arguments of cn / clsx, an UPPER_CASE constant's text. */
function classStrings(): { where: string; name: string }[] {
  const found: { where: string; name: string }[] = [];
  for (const file of ['src/ui', 'src/viewer', 'src/desktop'].flatMap((folder) => sources(join(ROOT, folder)))) {
    if (file.startsWith('src/desktop/main/')) continue;
    const source = readFileSync(join(ROOT, file), 'utf8').replace(
      /^\s*(\/\/|\*|\/\*).*$|\s\/\/ .*$|Record<[^>]*>/gm,
      '',
    );
    const literal = /"([^"\n]*)"|'([^'\n]*)'/g;
    const blocks = [
      ...source.matchAll(/className=(?:'[^'\n]*'|"[^"\n]*")/g),
      // a choice between classes, and classes in generated HTML
      ...source.matchAll(/className=\{[^{}]*\}/g),
      ...source.matchAll(/\bclass="[^"'\n]*"/g),
      ...source.matchAll(/\b(?:cn|clsx)\((?:[^()]|\([^()]*\))*\)/g),
      // only constants of class strings: the name says what they are for
      ...source.matchAll(
        /^(?:export )?const (?:[A-Z_]*(?:ROW|BUTTON|TAG|TONED|(?<!CODE_)MENU|ITEM|DANGER|BOX|RADIO|MARK|INLINE|BLOCK|CARET|DISCLOSURE|COMMAND|LIST|NOTE|DIALOG|BODY|SIZES|VARIANTS|HEIGHTS|TRIGGER|STEP|STEPS|HEADS|TONES|DOTS|SLOT))\b[^=\n]*=\s*(?:'[^'\n]*'|"[^"\n]*"|\{[^}]*\});/gm,
      ),
    ];
    for (const [block] of blocks) {
      // a string compared with something is a value, not a class
      for (const match of block.replace(/[=!]== (?:'[^']*'|"[^"]*")/g, '').matchAll(literal)) {
        for (const name of (match[1] ?? match[2]).split(/\s+/))
          if (name && !/^[A-Z]$/.test(name)) found.push({ where: file, name });
      }
    }
  }
  return found;
}

const CLASSES = classStrings();
const offenders = (bad: (name: string) => boolean) =>
  [...new Set(CLASSES.filter(({ name }) => bad(name)).map(({ where, name }) => where + ': ' + name))].join('\n');

test('the class strings were found', () => {
  assert.ok(CLASSES.length > 1000, `only ${CLASSES.length} classes read`);
});

test('no class writes a color, a font size, a corner or a layer of its own', () => {
  assert.equal(
    offenders((name) => /\[[^\]]*#[0-9a-f]{3,8}\b/i.test(name)),
    '',
    'a raw color',
  );
  assert.equal(
    offenders((name) => /(^|:)text-\[\d/.test(name)),
    '',
    'a font size off the type scale',
  );
  assert.equal(
    offenders((name) => /(^|:)rounded(-[a-z]+)?-\[\d+(px|rem)\]/.test(name)),
    '',
    'a corner off the radius scale',
  );
  assert.equal(
    offenders((name) => /(^|:)z-\[?\d/.test(name)),
    '',
    'a layer off the tokens',
  );
});

test('arbitrary padding, margins and gaps stay on the 4px grid', () => {
  const offGrid = (name: string) => {
    const match = /(?:^|:)-?(?:p|m|gap)[a-z]?(?:-[xy])?-\[(\d+)px\]/.exec(name);
    return match !== null && Number(match[1]) % 4 !== 0;
  };
  assert.equal(offenders(offGrid), '');
});

test("a size by the window's is --screen-w or --screen-h, which the UI's zoom doesn't stretch", () => {
  assert.equal(
    offenders((name) => /\b\d*v[wh]\b|(?:^|:)(?:min-|max-)?[wh]-screen$/.test(name)),
    '',
  );
});

test('a transition in a class string takes its timing from the motion tokens', () => {
  const offScale = (name: string) => {
    const match = /\[transition:([^\]]*)\]/.exec(name);
    return match !== null && /\d+m?s/.test(match[1]);
  };
  assert.equal(offenders(offScale), '');
});

// Tailwind writes bg-[gradient(…),color] as a background-image, where a color is invalid: no background at all
test('a gradient over a color is [background:…], not bg-[…]', () => {
  assert.equal(
    offenders((name) => /(?:^|:)bg-\[(?:linear|radial|conic)-gradient\(.*\),var\(--[^()]*\)\]$/.test(name)),
    '',
  );
});

// a selector that names a part nothing draws silently does nothing
test('every data-part a selector names is drawn', () => {
  const files = ['src/ui', 'src/viewer', 'src/desktop'].flatMap((folder) => [
    ...sources(join(ROOT, folder)),
    ...stylesheets(join(ROOT, folder)),
  ]);
  const text = files.map((file) => readFileSync(join(ROOT, file), 'utf8')).join('\n');
  const named = [...text.matchAll(/\[data-part=["']?([a-z][a-z-]*)/g)].map((match) => match[1]);
  const drawn = new Set(
    [...text.matchAll(/data-part(?:=|': |": )(?:\{)?["'`]([a-z][a-z-]*)/g)].map((match) => match[1]),
  );
  assert.deepEqual([...new Set(named)].filter((part) => !drawn.has(part)).sort(), []);
});

test('every class gives CSS: a typo or a step off the scales would otherwise do nothing, silently', async () => {
  let css = '';
  for (const page of [
    'viewer/main.tsx',
    'desktop/launcher/main.tsx',
    'desktop/shell/main.tsx',
    'desktop/menu/main.tsx',
  ]) {
    css += (await bundlePage(join(ROOT, 'src', page))).css;
  }
  const escaped = (name: string) => '.' + name.replace(/[^a-zA-Z0-9_-]/g, (char) => '\\' + char);
  // a group's name and a container's mark what other classes read; content-[…] holds a character the bundler writes as it is
  const isGroup = (name: string) => /^group\/|^@container\/|content-\[/.test(name);
  assert.equal(
    offenders((name) => !isGroup(name) && !css.includes(escaped(name))),
    '',
  );
});
