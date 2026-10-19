import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readBody, sendJson as send } from "../render/web/http.ts";
import type { ViewerInput } from "../render/web/server.ts";
import { placedHash } from "../summary/units.ts";
import { findCites } from "./cites.ts";
import { changeContext, questionText } from "./context.ts";
import { createAskSession, type AskLine, type AskQuestion, type AskSelection, type NewQuestion } from "./session.ts";

// The Ask rail's endpoints on the viewer server:
//   GET  /api/ask              the chat (the viewer polls it)
//   POST /api/ask              a new question from the viewer
//   POST /api/ask/prompt       the same question as text, for "Copy as prompt"
//   GET  /api/ask/next         `lens ask listen`: long-polls for the next question
//   POST /api/ask/<id>/answer  `lens ask reply`: the answer's markdown

/** How long one /api/ask/next request waits before answering 204 (the CLI asks again). */
export const NEXT_WAIT_MS = 25_000;
const NEXT_STEP_MS = 200;
const MAX_QUESTION = 4000;
const MAX_SELECTION_LINES = 400;
const MAX_ANSWER = 100_000;

export interface AskRoutes {
  /** true when it handled the request */
  handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean>;
  /** After ↻ refresh: mark questions whose code changed */
  refresh(): void;
}

export function createAskRoutes(current: () => ViewerInput, port: number): AskRoutes {
  const session = createAskSession();

  const fileHash = (input: ViewerInput, file: string): string | null => {
    const f = input.files.find((x) => x.file === file);
    return f ? createHash("sha256").update(f.source).digest("hex").slice(0, 16) : null;
  };
  const hashOf = (input: ViewerInput, q: Pick<AskQuestion, "file" | "unitId">): string | null => {
    // by place: an answer cites lines, which a unit that moved has elsewhere
    const unit = q.unitId ? input.summary?.units.find((u) => u.id === q.unitId) : undefined;
    return q.unitId ? (unit ? placedHash(unit) : null) : fileHash(input, q.file);
  };

  /** A question from the viewer's request body, or why it's not acceptable. */
  const parseQuestion = (body: string): NewQuestion | string => {
    let raw: Record<string, unknown>;
    try { raw = JSON.parse(body); } catch { return "not JSON"; }
    if (!raw || typeof raw !== "object") return "not a question object";
    const text = typeof raw.text === "string" ? raw.text.trim() : "";
    if (!text) return "the question is empty";
    if (text.length > MAX_QUESTION) return `the question is longer than ${MAX_QUESTION} characters`;
    if (typeof raw.file !== "string") return "file is missing";
    const unitId = typeof raw.unitId === "string" ? raw.unitId : null;
    const input = current();
    const hash = hashOf(input, { file: raw.file, unitId });
    if (!hash) return "that change isn't in the viewer anymore — refresh";
    const label = typeof raw.label === "string" && raw.label ? raw.label : raw.file;
    // the unit's own concerns, those the viewer names: which ones are dismissed only the reader's browser knows
    const named = new Set(Array.isArray(raw.concerns) ? raw.concerns.map(concernId) : []);
    const unit = unitId ? input.summary?.units.find((u) => u.id === unitId) : undefined;
    const concerns = (unit?.summary?.concerns ?? []).filter((c) => named.has(concernId(c)));
    // its possible breaks likewise, named by what they say
    const namedBreaks = new Set(Array.isArray(raw.breaks) ? raw.breaks.filter((b) => typeof b === "string") : []);
    const breaks = (unit?.summary?.breaks ?? [])
      .filter((b) => namedBreaks.has(b.summary))
      .map((b) => ({ summary: b.summary, callers: b.callers.map((c) => `${c.file}:${c.line}`) }));
    return { text, file: raw.file, unitId, label, hash, selection: parseSelection(raw.selection), concerns, breaks };
  };

  const textFor = (q: Pick<AskQuestion, "id" | "text" | "selection" | "concerns" | "breaks" | "file" | "unitId" | "label">, forCopy: boolean) => {
    const input = current();
    return questionText(q, changeContext(input, q), { forCopy, root: input.root, cwd: input.cwd, port });
  };

  return {
    async handle(req, res, url) {
      const path = url.pathname;
      if (path === "/api/ask" && req.method === "GET") {
        send(res, 200, session.state());
      } else if (path === "/api/ask" && req.method === "POST") {
        const q = parseQuestion(await readBody(req));
        // checked after the body's read, right before the add: two posts can't both get in
        if (session.waiting()) { send(res, 409, { error: "wait for the answer to the last question" }); return true; }
        if (typeof q === "string") { send(res, 400, { error: q }); return true; }
        send(res, 200, session.add(q));
      } else if (path === "/api/ask/prompt" && req.method === "POST") {
        const q = parseQuestion(await readBody(req));
        if (typeof q === "string") { send(res, 400, { error: q }); return true; }
        send(res, 200, { text: textFor({ ...q, id: "" }, true) });
      } else if (path === "/api/ask/next" && req.method === "GET") {
        session.listenStart();
        let closed = false;
        res.on("close", () => { closed = true; });
        try {
          const wait = Number(url.searchParams.get("wait") ?? NEXT_WAIT_MS);
          const deadline = Date.now() + (Number.isFinite(wait) ? Math.min(Math.max(wait, 0), NEXT_WAIT_MS) : NEXT_WAIT_MS);
          for (;;) {
            if (closed) return true;
            const q = session.next();
            if (q) { send(res, 200, { id: q.id, text: textFor(q, false) }); return true; }
            if (Date.now() >= deadline) { res.writeHead(204).end(); return true; }
            await new Promise((r) => setTimeout(r, NEXT_STEP_MS));
          }
        } finally {
          session.listenEnd();
        }
      } else if (/^\/api\/ask\/[^/]+\/answer$/.test(path) && req.method === "POST") {
        const id = decodeURIComponent(path.split("/")[3]);
        const markdown = (await readBody(req)).trim();
        if (!session.get(id)) { send(res, 404, { error: `no question ${id} in this lens session` }); return true; }
        if (!markdown) { send(res, 400, { error: "the answer is empty" }); return true; }
        if (markdown.length > MAX_ANSWER) { send(res, 400, { error: `the answer is longer than ${MAX_ANSWER} characters` }); return true; }
        const input = current();
        const { cites, unresolved } = findCites(markdown, input.root, input.cwd);
        session.answer(id, markdown, cites);
        send(res, 200, { id, cites: cites.length, unresolved });
      } else {
        return false;
      }
      return true;
    },
    refresh() {
      const input = current();
      session.refreshStale((q) => hashOf(input, q));
    },
  };
}

/** What makes a concern that one: its kind, its line and its text. */
function concernId(raw: unknown): string {
  const { kind, line, text } = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return JSON.stringify([kind, line, text]);
}

function parseSelection(raw: unknown): AskSelection | null {
  if (!raw || typeof raw !== "object") return null;
  const { file, lines } = raw as Record<string, unknown>;
  if (typeof file !== "string" || !Array.isArray(lines)) return null;
  const clean: AskLine[] = [];
  for (const l of lines.slice(0, MAX_SELECTION_LINES)) {
    if (!l || typeof l !== "object") continue;
    const { n, side, text } = l as Record<string, unknown>;
    if ((side !== "new" && side !== "old") || typeof text !== "string") continue;
    clean.push({ n: Number.isInteger(n) ? (n as number) : null, side, text });
  }
  return clean.length > 0 ? { file, lines: clean } : null;
}
