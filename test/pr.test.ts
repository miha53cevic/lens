import { test } from "bun:test";
import assert from "node:assert/strict";
import { parsePrRef, githubRepoFromRemoteUrl, matchRemote, parseRemoteRefs } from "../src/cli-app/pr.ts";

test("parsePrRef accepts PR URLs in the forms GitHub produces", () => {
  assert.deepEqual(parsePrRef("https://github.com/anthropics/claude-code/pull/42"), {
    owner: "anthropics", repo: "claude-code", number: 42,
  });
  assert.deepEqual(parsePrRef("https://github.com/a/b/pull/7/files?w=1#discussion_r1"), {
    owner: "a", repo: "b", number: 7,
  });
  assert.deepEqual(parsePrRef("http://www.github.com/a/b.js/pull/3"), {
    owner: "a", repo: "b.js", number: 3,
  });
  assert.deepEqual(parsePrRef("github.com/a/b/pull/9"), { owner: "a", repo: "b", number: 9 });
});

test("parsePrRef accepts bare numbers", () => {
  assert.deepEqual(parsePrRef("123"), { owner: "", repo: "", number: 123 });
  assert.deepEqual(parsePrRef(" 123 "), { owner: "", repo: "", number: 123 });
});

test("parsePrRef rejects everything else", () => {
  assert.equal(parsePrRef("https://github.com/a/b/issues/42"), null);
  assert.equal(parsePrRef("https://gitlab.com/a/b/pull/42"), null);
  assert.equal(parsePrRef("https://github.com/a/b/pull/"), null);
  assert.equal(parsePrRef("a/b#123"), null);
  assert.equal(parsePrRef("main...feature"), null);
  assert.equal(parsePrRef(""), null);
});

test("githubRepoFromRemoteUrl handles https, ssh, and scp-like remotes", () => {
  assert.deepEqual(githubRepoFromRemoteUrl("https://github.com/a/b.git"), { owner: "a", repo: "b" });
  assert.deepEqual(githubRepoFromRemoteUrl("https://github.com/a/b"), { owner: "a", repo: "b" });
  assert.deepEqual(githubRepoFromRemoteUrl("git@github.com:a/b.git"), { owner: "a", repo: "b" });
  assert.deepEqual(githubRepoFromRemoteUrl("ssh://git@github.com/a/b.git"), { owner: "a", repo: "b" });
  assert.deepEqual(githubRepoFromRemoteUrl("https://user@github.com/a/b.git"), { owner: "a", repo: "b" });
  assert.deepEqual(githubRepoFromRemoteUrl("ssh://git@github.com:22/a/b.git"), { owner: "a", repo: "b" });
  assert.deepEqual(githubRepoFromRemoteUrl("ssh://git@ssh.github.com:443/a/b.git"), { owner: "a", repo: "b" });
  assert.equal(githubRepoFromRemoteUrl("https://gitlab.com/a/b.git"), null);
  assert.equal(githubRepoFromRemoteUrl("git@github.com"), null);
});

const REMOTES = [
  "remote.origin.url git@github.com:me/fork.git",
  "remote.upstream.url https://github.com/them/project.git",
  "remote.other.url https://example.com/not-github.git",
].join("\n");

test("matchRemote finds the remote whose URL matches the PR's repo", () => {
  assert.deepEqual(
    matchRemote(REMOTES, { owner: "them", repo: "project", number: 5 }),
    { remote: "upstream", ref: { owner: "them", repo: "project", number: 5 } },
  );
  // owner/repo compare case-insensitively, as GitHub does
  assert.deepEqual(
    matchRemote(REMOTES, { owner: "Them", repo: "Project", number: 5 })?.remote,
    "upstream",
  );
  assert.equal(matchRemote(REMOTES, { owner: "nobody", repo: "nothing", number: 5 }), null);
});

test("matchRemote resolves a bare PR number against origin", () => {
  const hit = matchRemote(REMOTES, { owner: "", repo: "", number: 9 });
  assert.deepEqual(hit, { remote: "origin", ref: { owner: "me", repo: "fork", number: 9 } });
  assert.equal(matchRemote("remote.x.url https://example.com/a/b.git", { owner: "", repo: "", number: 1 }), null);
  // no origin: one GitHub remote is it; with several, guessing would be wrong half the time
  assert.equal(matchRemote("remote.up.url https://github.com/a/b.git", { owner: "", repo: "", number: 1 })?.remote, "up");
  assert.equal(matchRemote("remote.up.url https://github.com/a/b.git\nremote.fork.url https://github.com/c/b.git",
    { owner: "", repo: "", number: 1 }), null);
});

test("parseRemoteRefs reads head, merge, and default branch from ls-remote", () => {
  const listing = [
    "ref: refs/heads/main\tHEAD",
    "aaa111\tHEAD",
    "bbb222\trefs/pull/5/head",
    "ccc333\trefs/pull/5/merge",
  ].join("\n");
  assert.deepEqual(parseRemoteRefs(listing, 5), {
    headSha: "bbb222", mergeSha: "ccc333", defaultRef: "refs/heads/main", defaultSha: "aaa111",
  });
});

test("parseRemoteRefs tolerates a missing merge ref and a missing PR", () => {
  const noMerge = "ref: refs/heads/dev\tHEAD\naaa\tHEAD\nbbb\trefs/pull/12/head";
  assert.deepEqual(parseRemoteRefs(noMerge, 12), {
    headSha: "bbb", mergeSha: null, defaultRef: "refs/heads/dev", defaultSha: "aaa",
  });
  assert.deepEqual(parseRemoteRefs("ref: refs/heads/main\tHEAD\naaa\tHEAD", 3), {
    headSha: null, mergeSha: null, defaultRef: "refs/heads/main", defaultSha: "aaa",
  });
  // other PRs' refs never bleed in
  assert.equal(parseRemoteRefs("bbb\trefs/pull/50/head", 5).headSha, null);
});
