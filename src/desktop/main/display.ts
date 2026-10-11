import { homedir } from 'node:os';
import { toPosix } from '../../cli-app/paths.ts';

/** A path as the app shows it: `/`-separated, the home folder as ~. */
export function tildePath(path: string, home: string = homedir()): string {
  const shown = toPosix(path);
  const base = toPosix(home).replace(/\/$/, '');
  return shown === base ? '~' : shown.startsWith(base + '/') ? '~' + shown.slice(base.length) : shown;
}
