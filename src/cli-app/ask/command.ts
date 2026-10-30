import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findServerInfo } from './discovery.ts';

// `lens ask listen|reply` — the agent's side of the Ask rail. listen waits for
// one question and prints it (with the rules and the reply command); reply
// posts the answer. Lens itself never answers anything.

const DEFAULT_PORT = 5326;

/** port: --port when it was given, else null (then .lens/server.json, then the default). */
export async function runAsk(rest: string[], cwd: string, port: number | null): Promise<void> {
  const [sub, ...args] = rest;
  if (port !== null && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new Error('--port needs a number between 1 and 65535');
  }
  const base = `http://127.0.0.1:${port ?? findServerInfo(cwd)?.port ?? DEFAULT_PORT}`;
  if (sub === 'listen') {
    if (args.length > 0) throw new Error('ask listen takes no arguments');
    return listen(base);
  }
  if (sub === 'reply') {
    const [id, source] = args;
    if (!id || !source || args.length > 2) throw new Error('usage: lens ask reply <id> <answer.md | ->');
    const markdown = source === '-' ? readFileSync(0, 'utf8') : readFileSync(resolve(cwd, source), 'utf8');
    return reply(base, id, markdown);
  }
  throw new Error('usage: lens ask listen | lens ask reply <id> <answer.md | ->');
}

async function listen(base: string): Promise<void> {
  for (;;) {
    const res = await call(base + '/api/ask/next');
    if (res.status === 204) continue; // nothing yet: ask again
    if (!res.ok) throw new Error(`the viewer answered ${res.status}: ${await res.text()}`);
    const { text } = (await res.json()) as { id: string; text: string };
    process.stdout.write(text);
    return;
  }
}

async function reply(base: string, id: string, markdown: string): Promise<void> {
  const res = await call(`${base}/api/ask/${encodeURIComponent(id)}/answer`, { method: 'POST', body: markdown });
  const raw = await res.text();
  let body: { error?: string; cites?: number; unresolved?: string[] } | null = null;
  try {
    body = JSON.parse(raw);
  } catch {
    /* not a lens viewer */
  }
  if (!res.ok || !body) throw new Error(body?.error ?? `the viewer answered ${res.status}: ${raw}`);
  const cites = body.cites ?? 0;
  console.log(`lens: answered ${id} (${cites} cite${cites === 1 ? '' : 's'} linked)`);
  const unresolved = body.unresolved ?? [];
  if (unresolved.length > 0) {
    console.log(
      `\nthese don't point at a real line, so they show as plain text — fix them and reply to ${id} again if they matter:`,
    );
    for (const u of unresolved) console.log(`  - ${u}`);
  }
  const notes = replyNotes(markdown, cites + unresolved.length);
  if (notes.length > 0) {
    console.log(`\nthe answer is in the rail; reply to ${id} again if these matter:`);
    for (const note of notes) console.log(`  - ${note}`);
  }
}

/** Past this many words an answer is more than the rail's reader wants (HOW_TO_ANSWER asks for 120 to 300). */
const LONG_ANSWER_WORDS = 400;

/** Where an answer skips the brief: soft notes, the answer is in the rail either way. refs: its path:line refs, valid or not. */
export function replyNotes(markdown: string, refs: number): string[] {
  const notes: string[] = [];
  if (refs === 0) notes.push('it cites no code: back its claims with path:line cites');
  const words = markdown.split(/\s+/).filter(Boolean).length;
  if (words > LONG_ANSWER_WORDS) notes.push(`it runs ${words} words: about 120 is the aim, 300 for a walkthrough`);
  return notes;
}

async function call(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    const port = new URL(url).port;
    throw new Error(
      `no lens viewer is answering on port ${port} — start one (lens diff, lens pr N, lens <path>), ` +
        'or pass --port if it runs on another port',
    );
  }
}
