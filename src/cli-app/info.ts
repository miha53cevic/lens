import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename } from 'node:path';
import { loadConfig } from './config.ts';
import { planTabOn } from './summary/settings.ts';
import { untrackedCommand } from './git.ts';
import { toPosix } from './paths.ts';
import { matchRemote } from './pr.ts';
import { SUGGESTED_THEMES, isBundledTheme, themeSwatch, type ThemeSwatch } from './render/highlight.ts';
import { plural } from './text.ts';
// imported, so the compiled `lens` carries it
import manifest from '../../package.json' with { type: 'json' };

// `lens info`: what a picker needs to know before a review starts — is there git, is this a
// repository, what could be reviewed in it. Read-only: it fetches nothing and writes nothing.
// The desktop app reads it as JSON; all git logic stays here, under the node tests.

export interface RepoInfo {
  /** The repository's root, `/`-separated */
  root: string;
  name: string;
  /** The checked-out branch, or null on a detached HEAD */
  branch: string | null;
  /** HEAD's short SHA, or null before the first commit */
  head: string | null;
  /** Local branches, the checked-out one included */
  branches: string[];
  /** What "this branch vs" compares against: --base, else the remote's default branch, else main / master */
  base: string | null;
  /** Commits on HEAD that `base` doesn't have, or null without a base */
  ahead: number | null;
  /** Files `lens diff` would show: changed in the working tree and not staged, or new there (untracked) */
  changed: number;
  /** Files `lens diff --staged` would show */
  staged: number;
  /** The GitHub repository `lens pr <N>` would fetch from, or null without such a remote */
  github: { remote: string; owner: string; repo: string } | null;
  /** The Plan tab is on here: then a working tree with nothing in it still opens, on that tab (cli.ts) */
  planTab: boolean;
}

export interface LensInfo {
  /** lens's own version */
  version: string;
  /** git's version, or null when git isn't on PATH */
  git: string | null;
  /** The repository `cwd` is in, or null outside one */
  repo: RepoInfo | null;
  /** The config's theme here (.lens.json, else the default) */
  theme: string;
  /** With --themes: the theme menu's themes and their colors */
  themes?: ThemeSwatch[];
}

export interface InfoOptions {
  /** The branch or ref "this branch vs" compares against, instead of the default */
  base?: string;
  themes?: boolean;
  /** --theme: this theme instead of the config's, so --themes gives its colors too */
  theme?: string;
}

const execFileAsync = promisify(execFile);

/** git's output; throws with git's reason when it fails */
async function git(args: string[], cwd?: string): Promise<string> {
  return (await execFileAsync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })).stdout;
}

/** git's answer, or null when it fails (no such ref, no commits yet, no remote). */
async function tryGit(args: string[], cwd: string): Promise<string | null> {
  try {
    return (await git(args, cwd)).trim();
  } catch {
    return null;
  }
}

async function gitVersion(): Promise<string | null> {
  try {
    const output = await git(['--version']);
    return /\d+(\.\d+)+/.exec(output)?.[0] ?? output.trim();
  } catch {
    return null;
  }
}

/** How many paths a `--name-only -z` listing names. */
function countPaths(listing: string): number {
  return listing.split('\0').filter(Boolean).length;
}

/**
 * The default base for "this branch vs": the remote's default branch as a local branch when
 * there is one (what you'd type), else its remote-tracking name, else a local main / master.
 */
function defaultBase(remoteHead: string | null, branches: string[]): string | null {
  if (remoteHead) {
    const local = remoteHead.replace(/^origin\//, '');
    return branches.includes(local) ? local : remoteHead;
  }
  return ['main', 'master'].find((name) => branches.includes(name)) ?? null;
}

// The reads run side by side, each a git process: the desktop app's picker asks every few seconds.
async function repoInfo(cwd: string, wantedBase: string | undefined): Promise<RepoInfo | null> {
  const top = await tryGit(['rev-parse', '--show-toplevel'], cwd);
  if (!top) return null;
  const root = toPosix(top);
  const untracked = untrackedCommand(top, cwd, []);
  const [refs, head, wanted, remoteHead, remotes, branch, changed, untrackedList, staged] = await Promise.all([
    git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], cwd),
    tryGit(['rev-parse', '--short', 'HEAD'], cwd),
    wantedBase === undefined ? null : tryGit(['rev-parse', '--verify', '--quiet', `${wantedBase}^{commit}`], cwd),
    tryGit(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], cwd),
    tryGit(['config', '--get-regexp', '^remote\\..*\\.url$'], cwd),
    tryGit(['symbolic-ref', '--quiet', '--short', 'HEAD'], cwd),
    git(['diff', '--name-only', '-z', '--no-relative'], cwd),
    git(untracked.args, untracked.dir),
    git(['diff', '--staged', '--name-only', '-z', '--no-relative'], cwd),
  ]);
  const branches = refs.split('\n').filter(Boolean);
  if (wantedBase !== undefined && wanted === null) {
    throw new Error(`"${wantedBase}" is not a branch or commit here`);
  }
  const base = wantedBase ?? defaultBase(remoteHead, branches);
  const ahead = base && head ? await tryGit(['rev-list', '--count', `${base}..HEAD`], cwd) : null;
  const github = matchRemote(remotes ?? '', { owner: '', repo: '', number: 0 });

  return {
    root,
    name: basename(root),
    branch,
    head,
    branches,
    base,
    ahead: ahead === null ? null : Number(ahead),
    changed: countPaths(changed) + countPaths(untrackedList),
    staged: countPaths(staged),
    github: github ? { remote: github.remote, owner: github.ref.owner, repo: github.ref.repo } : null,
    planTab: planTabOn(root, loadConfig(cwd)),
  };
}

export async function lensInfo(cwd: string, options: InfoOptions = {}): Promise<LensInfo> {
  const git = await gitVersion();
  const theme = options.theme ?? loadConfig(cwd).theme;
  if (!isBundledTheme(theme)) {
    throw new Error(`unknown theme "${theme}" — pick a Shiki theme name (https://shiki.style/themes)`);
  }
  const info: LensInfo = {
    version: manifest.version,
    git,
    repo: git === null ? null : await repoInfo(cwd, options.base),
    theme,
  };
  if (options.themes) {
    // the config's theme may be any Shiki theme, not one of the menu's
    const names = SUGGESTED_THEMES.includes(theme) ? SUGGESTED_THEMES : [theme, ...SUGGESTED_THEMES];
    info.themes = await Promise.all(names.map(themeSwatch));
  }
  return info;
}

function describe(info: LensInfo): string {
  const lines = [`lens ${info.version} · ${info.git ? 'git ' + info.git : 'git not found'}`];
  const { repo } = info;
  if (!repo) return lines.concat('not inside a git repository').join('\n');
  lines.push(`repository  ${repo.root}`);
  lines.push(`branch      ${repo.branch ?? `detached at ${repo.head ?? 'no commit'}`}`);
  lines.push(`changes     ${plural(repo.changed, 'file')} changed, ${repo.staged} staged`);
  if (repo.base !== null && repo.ahead !== null)
    lines.push(`ahead       ${plural(repo.ahead, 'commit')} since ${repo.base}`);
  if (repo.github) lines.push(`github      ${repo.github.remote} → ${repo.github.owner}/${repo.github.repo}`);
  return lines.join('\n');
}

/** `lens info [--json] [--themes] [--base <ref>] [--theme <name>]` */
export async function runInfo(args: string[], cwd: string, json: boolean, theme: string | null): Promise<void> {
  const options: InfoOptions = theme === null ? {} : { theme };
  const rest = [...args];
  while (rest.length > 0) {
    const arg = rest.shift()!;
    if (arg === '--themes') options.themes = true;
    else if (arg === '--base') {
      const base = rest.shift();
      if (!base) throw new Error('--base needs a branch or commit');
      options.base = base;
    } else throw new Error(`lens info doesn't take "${arg}" — it reads the repository you run it in`);
  }
  const info = await lensInfo(cwd, options);
  console.log(json ? JSON.stringify(info, null, 2) : describe(info));
}
