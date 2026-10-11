// What the picker chose to review, and the one place it becomes `lens` arguments. Nothing else in
// the app writes CLI arguments: test/app-choice.test.ts runs every kind of choice through the real
// CLI, so a change to the CLI's arguments that this file doesn't follow fails `npm test`.

export type ReviewChoice =
  | { kind: 'diff'; range: 'worktree' | 'staged' }
  | { kind: 'diff'; range: 'branch'; base: string }
  /** `args`: any `git diff` arguments, as typed */
  | { kind: 'diff'; range: 'custom'; args: string }
  /** `ref`: a PR number or a GitHub PR URL, as typed */
  | { kind: 'pr'; ref: string };

/** lens's own flags: in a custom diff they would change how lens runs, not what git diffs. */
const LENS_FLAGS = ['--json', '--no-open', '--summary', '--port', '--threshold', '--theme', '--help', '-h'];

/** Splits what was typed as a shell would: on spaces, keeping quoted stretches whole. */
export function splitArgs(text: string): string[] {
  const args: string[] = [];
  let current = '';
  let quote: string | null = null;
  let started = false;
  for (const char of text) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      started = true;
    } else if (/\s/.test(char)) {
      if (started) args.push(current);
      current = '';
      started = false;
    } else {
      current += char;
      started = true;
    }
  }
  if (started) args.push(current);
  return args;
}

/** What a page can type into one field; longer is not something a person meant. */
const MAX_TEXT = 2000;

/**
 * A choice that came from a page, checked: the main process builds the CLI's arguments from this
 * and nothing else, so a page can't hand it a command line. Null when it isn't a choice.
 */
export function parseChoice(value: unknown): ReviewChoice | null {
  if (typeof value !== 'object' || value === null) return null;
  const { kind, range, base, args, ref } = value as Record<string, unknown>;
  const text = (field: unknown): field is string => typeof field === 'string' && field.length <= MAX_TEXT;
  if (kind === 'pr') return text(ref) ? { kind, ref } : null;
  if (kind !== 'diff') return null;
  if (range === 'worktree' || range === 'staged') return { kind, range };
  if (range === 'branch') return text(base) ? { kind, range, base } : null;
  if (range === 'custom') return text(args) ? { kind, range, args } : null;
  return null;
}

/** Why this choice can't be opened as it stands, or null when it can. */
export function choiceProblem(choice: ReviewChoice): string | null {
  if (choice.kind === 'pr') {
    const ref = choice.ref.trim();
    if (ref === '') return 'Enter a PR number or URL';
    return ref.startsWith('-') ? `"${ref}" is not a PR number or URL` : null;
  }
  if (choice.range === 'branch') {
    const base = choice.base.trim();
    if (base === '') return 'Pick a branch to compare against';
    // a name git would read as an option, or as more than one argument
    return base.startsWith('-') || /\s/.test(base) ? `"${base}" is not a branch name` : null;
  }
  if (choice.range !== 'custom') return null;
  const args = splitArgs(choice.args);
  if (args.length === 0) return 'Type the git diff arguments';
  const flag = args.find((arg) => LENS_FLAGS.includes(arg));
  return flag ? `${flag} is a lens flag, not a git diff argument` : null;
}

/** The words after `lens` that open this choice. */
export function choiceArgs(choice: ReviewChoice): string[] {
  if (choice.kind === 'pr') return ['pr', choice.ref.trim()];
  switch (choice.range) {
    case 'worktree':
      return ['diff'];
    case 'staged':
      return ['diff', '--staged'];
    case 'branch':
      return ['diff', choice.base.trim() + '...HEAD'];
    case 'custom':
      return ['diff', ...splitArgs(choice.args)];
  }
}

/** The command as you would type it: what the picker shows under the choices. */
export function choiceCommand(choice: ReviewChoice): string {
  const quoted = choiceArgs(choice).map((arg) => (/[\s"']/.test(arg) ? JSON.stringify(arg) : arg));
  return ['lens', ...quoted].join(' ').trimEnd();
}

/** What a tab says it shows, after the repository's name. */
export function choiceLabel(choice: ReviewChoice): string {
  if (choice.kind === 'pr') {
    const number = /(\d+)(?:[/?#].*)?$/.exec(choice.ref.trim())?.[1];
    return number ? 'PR #' + number : 'PR ' + choice.ref.trim();
  }
  switch (choice.range) {
    case 'worktree':
      return 'working tree';
    case 'staged':
      return 'staged changes';
    case 'branch':
      return 'vs ' + choice.base.trim();
    case 'custom':
      return 'diff ' + choice.args.trim();
  }
}
