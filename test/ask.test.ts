import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { analyze } from "../src/analyze.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { createAskSession, REHAND_AFTER_MS, LISTEN_GRACE_MS, type NewQuestion } from "../src/ask/session.ts";
import { findCites } from "../src/ask/cites.ts";
import { changeContext, questionText, selectionLabel, RULES } from "../src/ask/context.ts";
import { createAskRoutes } from "../src/ask/routes.ts";
import type { ViewerInput } from "../src/render/web/server.ts";

const Q: NewQuestion = { text: "why?", file: "a.ts", unitId: null, label: "a.ts", hash: "h1", selection: null };

/** Runs `fn` in a fresh temp git repo (branch "main"), cleaned up afterwards. */
async function withRepo(fn: (dir: string, git: (...args: string[]) => string) => Promise<void>): Promise<void> {
  // realpath: on Windows tmpdir() can be an 8.3 short path, git reports the long one
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), "lens-ask-")));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  try {
    git("init", "-q", "-b", "main");
    git("config", "user.email", "t@t");
    git("config", "user.name", "t");
    await fn(dir, git);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const OLD = `export function total(items: number[]): number {
  let sum = 0;
  for (const i of items) sum += i;
  return sum;
}
`;
const NEW = `export function total(items: number[]): number {
  return items.reduce((a, b) => a + b, 0);
}
`;

/** A repo with one committed file and an unstaged change to it, analyzed like `lens diff`. */
async function changedRepo(dir: string, git: (...args: string[]) => string): Promise<ViewerInput> {
  writeFileSync(join(dir, "calc.ts"), OLD);
  git("add", "-A");
  git("commit", "-qm", "base");
  writeFileSync(join(dir, "calc.ts"), NEW);
  return analyze("diff", [], dir, DEFAULT_CONFIG);
}

test("ask session: questions are handed out oldest first, once, and again after a while", () => {
  let t = 1000;
  const s = createAskSession(() => t);
  const a = s.add(Q);
  const b = s.add({ ...Q, text: "and?" });
  assert.equal(a.id, "q1");
  assert.equal(b.id, "q2");
  assert.equal(s.next()?.id, "q1");
  assert.equal(s.next()?.id, "q2");
  assert.equal(s.next(), null, "both are with an agent");
  t += REHAND_AFTER_MS;
  assert.equal(s.next()?.id, "q1", "an agent that never answered doesn't hold the question forever");
  assert.ok(s.answer("q1", "because", []));
  assert.ok(s.answer("q1", "because, fixed", []), "a second reply replaces the answer");
  assert.equal(s.get("q1")?.answer?.markdown, "because, fixed");
  assert.equal(s.answer("q9", "x", []), false);
  assert.equal(s.waiting()?.id, "q2");
  s.answer("q2", "ok", []);
  assert.equal(s.waiting(), null);
});

test("ask session: listening while a listen is open, and for a grace period after", () => {
  let t = 0;
  const s = createAskSession(() => t);
  t = LISTEN_GRACE_MS * 2;
  assert.equal(s.state().listening, false);
  s.listenStart();
  assert.equal(s.state().listening, true);
  s.listenEnd();
  t += LISTEN_GRACE_MS - 1;
  assert.equal(s.state().listening, true, "between reply and the next listen");
  t += 1;
  assert.equal(s.state().listening, false);
});

test("ask session: a question goes stale when its code's hash changes or it's gone", () => {
  const s = createAskSession();
  s.add(Q);
  s.add({ ...Q, file: "b.ts", hash: "h2" });
  s.refreshStale((q) => (q.file === "a.ts" ? "h1" : null));
  assert.deepEqual(s.state().questions.map((q) => q.stale), [false, true]);
  s.refreshStale((q) => (q.file === "a.ts" ? "changed" : "h2"));
  assert.deepEqual(s.state().questions.map((q) => q.stale), [true, false]);
});

test("findCites keeps path:line refs that point at real lines, in the viewer's paths", () => {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "lens-cites-")));
  try {
    mkdirSync(join(root, "src", "ask"), { recursive: true });
    writeFileSync(join(root, "src", "ask", "a.ts"), "one\ntwo\nthree\n");
    const md = "See `src/ask/a.ts:2` and src/ask/a.ts:3–4, not src/ask/a.ts:40 or src/b.ts:1 or ../x.ts:1. Time 12:30.";
    const { cites, unresolved } = findCites(md, root, join(root, "src"));
    assert.deepEqual(cites, [
      { ref: "src/ask/a.ts:2", file: "ask/a.ts", line: 2 },
      { ref: "src/ask/a.ts:3–4", file: "ask/a.ts", line: 3 },
    ]);
    assert.deepEqual(unresolved, [
      "src/ask/a.ts:40 — the file has only 4 lines",
      "src/b.ts:1 — file not found",
      "../x.ts:1 must be a path relative to the repository root",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("selectionLabel names the new-side lines, or the removed ones", () => {
  assert.equal(selectionLabel({ file: "a.ts", lines: [{ n: 4, side: "new", text: "" }, { n: 2, side: "old", text: "" }, { n: 5, side: "new", text: "" }] }), "a.ts:4–5");
  assert.equal(selectionLabel({ file: "a.ts", lines: [{ n: 7, side: "new", text: "" }] }), "a.ts:7");
  assert.equal(selectionLabel({ file: "a.ts", lines: [{ n: 2, side: "old", text: "" }, { n: 3, side: "old", text: "" }] }), "a.ts (removed lines 2–3)");
});

test("questionText: rules, the question, the selection and the unit's code, then how to reply", async () => {
  await withRepo(async (dir, git) => {
    const input = await changedRepo(dir, git);
    const unit = input.summary!.units.find((u) => u.id === "calc.ts#total")!;
    assert.ok(unit, "the changed function is a unit");
    const q = {
      id: "q1",
      text: "  is reduce safe on an empty list?  ",
      file: "calc.ts",
      unitId: unit.id,
      label: "total",
      selection: { file: "calc.ts", lines: [
        { n: 2, side: "old" as const, text: "  let sum = 0;" },
        { n: 2, side: "new" as const, text: "  return items.reduce((a, b) => a + b, 0);" },
      ] },
    };
    const text = questionText(q, changeContext(input, q), { root: dir, cwd: dir, port: 5326 });
    assert.ok(text.startsWith("lens ask · q1 · total (calc.ts)\n"));
    assert.ok(text.includes(RULES));
    assert.ok(text.includes("QUESTION\nis reduce safe on an empty list?\n"));
    assert.ok(text.includes("SELECTION  calc.ts:2 (removed lines marked −)\n  2−   let sum = 0;\n  2    return items.reduce"));
    assert.ok(text.includes("THE CHANGE  total"));
    assert.ok(text.includes("  2+   return items.reduce((a, b) => a + b, 0);"), "changed lines are marked +");
    assert.ok(text.includes("−   for (const i of items) sum += i;"), "removed lines are in the change");
    assert.match(text, /lens ask reply q1 ".*\/\.lens\/ask\/answer\.md" --port 5326/);

    const copy = questionText(q, changeContext(input, q), { forCopy: true, root: dir, cwd: dir, port: 5326 });
    assert.ok(!copy.includes("RULES"), "a chat paste carries no agent rules");
    assert.ok(!copy.includes("lens ask reply"));
    assert.ok(copy.includes("is reduce safe on an empty list?"));

    const whole = { ...q, unitId: null, label: "calc.ts", selection: null };
    const fileText = questionText(whole, changeContext(input, whole), { root: dir, cwd: dir, port: 5326 });
    assert.ok(fileText.includes("THE FILE  calc.ts — changed lines 2\n"), "a Code-tab question names the file, not its code");
  });
});

async function listen(handler: Parameters<typeof createServer>[1]): Promise<{ server: Server; base: string }> {
  const server = createServer(handler);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

test("ask routes: ask, listen, answer, and stale after the code changes", async () => {
  await withRepo(async (dir, git) => {
    let input = await changedRepo(dir, git);
    const routes = createAskRoutes(() => input, 5326);
    const { server, base } = await listen(async (req, res) => {
      if (!(await routes.handle(req, res, new URL(req.url ?? "/", "http://x")))) { res.writeHead(404); res.end(); }
    });
    try {
      const post = (path: string, body: unknown) =>
        fetch(base + path, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

      assert.equal((await fetch(base + "/api/ask/next?wait=0")).status, 204, "nothing to hand out yet");
      assert.equal((await post("/api/ask", { text: "  ", file: "calc.ts" })).status, 400);
      assert.equal((await post("/api/ask", { text: "hi", file: "nope.ts" })).status, 400);

      const asked = await post("/api/ask", { text: "why reduce?", file: "calc.ts", unitId: "calc.ts#total", label: "total" });
      assert.equal(asked.status, 200);
      assert.equal((await asked.json()).id, "q1");
      assert.equal((await post("/api/ask", { text: "and?", file: "calc.ts" })).status, 409, "one question at a time");

      const prompt = await (await post("/api/ask/prompt", { text: "x", file: "calc.ts" })).json();
      assert.ok(prompt.text.includes("THE FILE  calc.ts"));

      const next = await fetch(base + "/api/ask/next?wait=0");
      const handed = await next.json();
      assert.equal(handed.id, "q1");
      assert.ok(handed.text.includes("why reduce?"));
      assert.equal((await fetch(base + "/api/ask")).status, 200);
      assert.equal((await (await fetch(base + "/api/ask")).json()).listening, true, "a listen just ended");

      assert.equal((await post("/api/ask/q7/answer", "x")).status, 404);
      const replied = await (await post("/api/ask/q1/answer", "Shorter: calc.ts:2 replaces the loop. Not calc.ts:99.")).json();
      assert.deepEqual(replied, { id: "q1", cites: 1, unresolved: ["calc.ts:99 — the file has only 4 lines"] });
      const state = await (await fetch(base + "/api/ask")).json();
      assert.deepEqual(state.questions[0].answer.cites, [{ ref: "calc.ts:2", file: "calc.ts", line: 2 }]);
      assert.equal(state.questions[0].stale, false);

      writeFileSync(join(dir, "calc.ts"), NEW.replace("0);", "0) || 0;"));
      input = await analyze("diff", [], dir, DEFAULT_CONFIG);
      routes.refresh();
      assert.equal((await (await fetch(base + "/api/ask")).json()).questions[0].stale, true);
    } finally {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
  });
});
