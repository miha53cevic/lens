// `lens config`: the config in effect, each value marked with the file it came from, and the problems found.

import { basename } from 'node:path';
import { problemLine, readConfig, type LoadedConfig } from './config.ts';
import type { CallPattern } from './model.ts';

const NAME_WIDTH = 22;

function lines(loaded: LoadedConfig): string[] {
  const { config, sources } = loaded;
  const project = loaded.path ? basename(loaded.path) : '';
  // a removal is the project's by definition
  const from = (key: string) => (sources[key] === 'project' || key.includes('.!') ? project : '');
  const row = (indent: number, name: string, value: string, key: string) => {
    const left = ' '.repeat(indent) + name.padEnd(NAME_WIDTH - indent) + value;
    const mark = from(key);
    return mark ? left.padEnd(56) + '  ← ' + mark : left.trimEnd();
  };
  const pattern = (entry: CallPattern) =>
    entry.receivers.join(', ') +
    (entry.methods ? ' · ' + entry.methods.join(', ') : '') +
    (entry.score !== undefined ? ' · score ' + entry.score : '');

  const out = [
    row(0, 'foldLevel', String(config.foldLevel), 'foldLevel'),
    row(0, 'theme', config.theme, 'theme'),
    'folds',
  ];
  for (const [category, fold] of Object.entries(config.folds)) {
    out.push(row(2, category, fold === false ? 'off' : 'score ' + fold, 'folds.' + category));
  }
  out.push('callPatterns');
  config.callPatterns.forEach((entry, index) =>
    out.push(row(2, entry.category, pattern(entry), 'callPatterns.' + index)),
  );
  for (const field of ['keepCommentMarkers', 'testFilePatterns', 'exclude'] as const) {
    out.push(field + (config[field].length === 0 ? '  (none)' : ''));
    config[field].forEach((entry, index) => out.push(row(2, entry, '', field + '.' + index)));
    for (const entry of loaded.removed[field] ?? []) out.push(row(2, entry, 'taken out', field + '.!' + entry));
  }
  out.push(row(0, 'keepDirective', config.keepDirective, 'keepDirective'));
  out.push(row(0, 'buildPreviews', String(config.buildPreviews), 'buildPreviews'));
  out.push(row(0, 'selfChecks', String(config.selfChecks), 'selfChecks'));
  return out;
}

/** Exits 1 when the file has problems, so a check in CI can run it. */
export function runConfig(cwd: string, json: boolean): void {
  const loaded = readConfig(cwd);
  if (json) {
    console.log(JSON.stringify(loaded, null, 2));
  } else {
    console.log(
      loaded.path
        ? `lens.defaults.json + ${loaded.path} (← marks what it sets)`
        : 'lens.defaults.json (no .lens.json found)',
    );
    console.log('');
    for (const line of lines(loaded)) console.log('  ' + line);
    if (loaded.problems.length > 0) {
      console.log('');
      console.log(
        loaded.problems.length === 1 ? '1 problem, skipped:' : loaded.problems.length + ' problems, skipped:',
      );
      for (const problem of loaded.problems) console.log('  ' + problemLine(problem));
    }
  }
  if (loaded.problems.length > 0) process.exitCode = 1;
}
