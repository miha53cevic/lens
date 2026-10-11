import { runGit } from "./git.ts";

// A GitHub pull request reference: parsed from a URL, or a bare number
// (owner/repo then comes from the origin remote).
export interface PrRef {
  owner: string;
  repo: string;
  number: number;
}

export interface ResolvedPr {
  /** Arguments for `git diff`: [mergeBase, headSha] */
  diffArgs: [string, string];
  /** "owner/repo#123", for the viewer header and logs */
  label: string;
}

const OWNER = "[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?";
const REPO = "[A-Za-z0-9._-]+";

/**
 * Parses a PR reference. Accepted forms:
 *   https://github.com/owner/repo/pull/123   (any suffix: /files, ?w=1, #r42)
 *   123                                      (returned with empty owner/repo)
 */
export function parsePrRef(arg: string): PrRef | null {
  const url = new RegExp(
    `^(?:https?://)?(?:www\\.)?github\\.com/(${OWNER})/(${REPO})/pull/(\\d+)(?:[/?#]|$)`,
  ).exec(arg.trim());
  if (url) return { owner: url[1], repo: stripGit(url[2]), number: Number(url[3]) };

  if (/^\d+$/.test(arg.trim())) return { owner: "", repo: "", number: Number(arg.trim()) };
  return null;
}

function stripGit(repo: string): string {
  return repo.endsWith(".git") ? repo.slice(0, -4) : repo;
}

/**
 * Extracts owner/repo from a GitHub remote URL (https, ssh, or scp-like) —
 * ssh ones may name a port, or ssh.github.com (GitHub's ssh over port 443).
 */
export function githubRepoFromRemoteUrl(url: string): { owner: string; repo: string } | null {
  const m =
    /^(?:(?:https?|ssh):\/\/(?:[^@/]+@)?(?:www\.|ssh\.)?github\.com(?::\d+)?\/|git@(?:ssh\.)?github\.com:)([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(
      url.trim(),
    );
  return m ? { owner: m[1], repo: m[2] } : null;
}

/**
 * Picks the remote pointing at owner/repo from `git config --get-regexp
 * ^remote\..*\.url$` output. Empty owner means "whatever origin points at";
 * the returned ref then carries origin's owner/repo.
 */
export function matchRemote(
  configOutput: string,
  ref: PrRef,
): { remote: string; ref: PrRef } | null {
  const remotes: { name: string; owner: string; repo: string }[] = [];
  for (const line of configOutput.split("\n")) {
    const m = /^remote\.(.+)\.url (.+)$/.exec(line.trim());
    if (!m) continue;
    const gh = githubRepoFromRemoteUrl(m[2]);
    if (gh) remotes.push({ name: m[1], ...gh });
  }
  if (ref.owner === "") {
    // no origin: a lone GitHub remote is the one; among several, which is a guess
    const origin = remotes.find((r) => r.name === "origin") ?? (remotes.length === 1 ? remotes[0] : undefined);
    return origin
      ? { remote: origin.name, ref: { ...ref, owner: origin.owner, repo: origin.repo } }
      : null;
  }
  const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;
  const hit = remotes.find((r) => same(r.owner, ref.owner) && same(r.repo, ref.repo));
  return hit ? { remote: hit.name, ref } : null;
}

export interface RemoteRefs {
  /** Tip of the PR branch (refs/pull/N/head) — null when the PR doesn't exist */
  headSha: string | null;
  /** GitHub's test-merge commit (refs/pull/N/merge); its first parent is the base tip */
  mergeSha: string | null;
  /** The remote's default branch (refs/heads/...), from the HEAD symref */
  defaultRef: string | null;
  defaultSha: string | null;
}

/** Parses `git ls-remote --symref <remote> HEAD refs/pull/N/head refs/pull/N/merge`. */
export function parseRemoteRefs(output: string, prNumber: number): RemoteRefs {
  const refs: RemoteRefs = { headSha: null, mergeSha: null, defaultRef: null, defaultSha: null };
  for (const line of output.split("\n")) {
    const [left, name] = line.split("\t");
    if (!left || !name) continue;
    if (left.startsWith("ref: ") && name === "HEAD") refs.defaultRef = left.slice(5);
    else if (name === "HEAD") refs.defaultSha = left;
    else if (name === `refs/pull/${prNumber}/head`) refs.headSha = left;
    else if (name === `refs/pull/${prNumber}/merge`) refs.mergeSha = left;
  }
  return refs;
}

/**
 * Resolves a PR reference into local git diff arguments, with git alone — no
 * GitHub API, so private repos just use your normal git auth. Fetches the PR
 * head (GitHub serves every PR at refs/pull/N/head, forks included) and a base
 * tip, then diffs from their merge base — the same range the PR page shows.
 *
 * The base tip comes from refs/pull/N/merge (GitHub's test-merge commit, whose
 * first parent is the PR's target branch) when GitHub still serves it; a PR
 * without one — long closed, or merge conflicts — falls back to the remote's
 * default branch, which is right unless the PR targets another branch.
 * Must run inside a clone with a remote pointing at the PR's repo.
 */
export async function resolvePr(arg: string, cwd: string): Promise<ResolvedPr> {
  const parsed = parsePrRef(arg);
  if (!parsed) {
    throw new Error(`"${arg}" is not a PR reference — use a github.com/…/pull/N URL or a PR number`);
  }
  let remotesOutput: string;
  try {
    remotesOutput = runGit(["config", "--get-regexp", "^remote\\..*\\.url$"], cwd);
  } catch {
    throw new Error("lens pr needs to run inside a git clone of the PR's repository");
  }
  const match = matchRemote(remotesOutput, parsed);
  if (!match) {
    throw new Error(
      parsed.owner === ""
        ? "no origin GitHub remote here — pass the full PR URL from inside a clone of its repository"
        : `no remote for ${parsed.owner}/${parsed.repo} found here — cd into a clone of it`,
    );
  }
  const { remote, ref } = match;
  const label = `${ref.owner}/${ref.repo}#${ref.number}`;

  // One remote round-trip: PR head + test-merge commit + default branch symref.
  const listing = runGit(
    ["ls-remote", "--symref", remote, "HEAD", `refs/pull/${ref.number}/head`, `refs/pull/${ref.number}/merge`],
    cwd,
  );
  const refs = parseRemoteRefs(listing, ref.number);
  if (!refs.headSha) {
    throw new Error(`${label} not found on remote "${remote}" — does the PR exist?`);
  }

  const baseRef = refs.mergeSha ? `refs/pull/${ref.number}/merge` : refs.defaultRef;
  if (!baseRef) throw new Error(`remote "${remote}" has no default branch to diff against`);
  runGit(["fetch", remote, `refs/pull/${ref.number}/head`, baseRef], cwd);
  const baseTip = refs.mergeSha
    ? runGit(["rev-parse", `${refs.mergeSha}^1`], cwd).trim()
    : refs.defaultSha!;

  let mergeBase: string;
  try {
    mergeBase = runGit(["merge-base", baseTip, refs.headSha], cwd).trim();
  } catch {
    throw new Error(
      `no merge base between ${baseRef} and the PR head — ` +
      `a shallow clone may lack the shared history (try \`git fetch --unshallow ${remote}\`)`,
    );
  }
  return { diffArgs: [mergeBase, refs.headSha], label };
}
