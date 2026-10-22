import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readBody, sendJson as send } from "../render/web/http.ts";
import type { ViewerInput } from "../render/web/server.ts";
import { changeNotes, NOTE_KINDS, notesFor, type NoteKind, type ReaderNote } from "./store.ts";

// The reader's notes on the viewer server:
//   POST   /api/notes        a new note
//   POST   /api/notes/<id>   its kind or text, edited
//   DELETE /api/notes/<id>   resolved: it goes
// Each answers the review's notes as they are now (NotesResponse).

const MAX_TEXT = 4000;
const MAX_LINES = 400;

/** What the notes' endpoints answer: every note on the review's files */
export interface NotesResponse {
  notes: ReaderNote[];
}

/** What POST /api/notes takes */
export type NewNote = Pick<ReaderNote, "file" | "side" | "start" | "end" | "lines" | "kind" | "text">;

export interface NoteRoutes {
  /** true when it handled the request */
  handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean>;
}

const isKind = (kind: unknown): kind is NoteKind => (NOTE_KINDS as readonly unknown[]).includes(kind);

/** The note's text, or why it can't be kept. */
function noteText(raw: unknown): string | { error: string } {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return { error: "the note is empty" };
  if (text.length > MAX_TEXT) return { error: `the note is longer than ${MAX_TEXT} characters` };
  return text;
}

/** A new note from the viewer's request body, or why it isn't one. */
function parseNew(raw: Record<string, unknown>, input: ViewerInput): NewNote | { error: string } {
  const { file, side, start, end, lines, kind } = raw;
  if (typeof file !== "string" || !input.files.some((shown) => shown.file === file)) {
    return { error: "that file isn't in the viewer anymore — refresh" };
  }
  if (side !== "new" && side !== "old") return { error: 'side must be "new" or "old"' };
  if (!Number.isInteger(start) || !Number.isInteger(end) || (start as number) < 1 || (end as number) < (start as number)) {
    return { error: "start and end must be line numbers, start first" };
  }
  const count = (end as number) - (start as number) + 1;
  if (count > MAX_LINES) return { error: `a note takes at most ${MAX_LINES} lines` };
  if (!Array.isArray(lines) || lines.length !== count || !lines.every((line) => typeof line === "string")) {
    return { error: "lines must be the text of each line it's on" };
  }
  if (!isKind(kind)) return { error: "kind must be one of " + NOTE_KINDS.join(", ") };
  const text = noteText(raw.text);
  if (typeof text !== "string") return text;
  return { file, side, start: start as number, end: end as number, lines: lines as string[], kind, text };
}

export function createNoteRoutes(current: () => ViewerInput, changed: () => void): NoteRoutes {
  const answer = (res: ServerResponse) => {
    const input = current();
    const body: NotesResponse = { notes: notesFor(input, input.files.map((file) => file.file)) };
    send(res, 200, body);
  };

  return {
    async handle(req, res, url) {
      const id = url.pathname.startsWith("/api/notes/") ? decodeURIComponent(url.pathname.slice("/api/notes/".length)) : null;
      if (url.pathname !== "/api/notes" && !id) return false;
      let raw: Record<string, unknown> = {};
      if (req.method === "POST") {
        try {
          raw = JSON.parse(await readBody(req)) ?? {};
        } catch {
          send(res, 400, { error: "not JSON" });
          return true;
        }
        if (typeof raw !== "object") {
          send(res, 400, { error: "not a note" });
          return true;
        }
      }
      const input = current();
      if (!id && req.method === "POST") {
        const note = parseNew(raw, input);
        if ("error" in note) {
          send(res, 400, note);
          return true;
        }
        changeNotes(input, (notes) => [...notes, { ...note, id: randomUUID(), at: new Date().toISOString() }]);
      } else if (id && req.method === "POST") {
        const text = noteText(raw.text);
        if (typeof text !== "string") {
          send(res, 400, text);
          return true;
        }
        if (!isKind(raw.kind)) {
          send(res, 400, { error: "kind must be one of " + NOTE_KINDS.join(", ") });
          return true;
        }
        const kind = raw.kind;
        let found = false;
        changeNotes(input, (notes) =>
          notes.map((note) => {
            if (note.id !== id) return note;
            found = true;
            return { ...note, kind, text, at: new Date().toISOString() };
          }),
        );
        if (!found) {
          send(res, 404, { error: "that note is gone — refresh" });
          return true;
        }
      } else if (id && req.method === "DELETE") {
        // already gone is what was asked for
        changeNotes(input, (notes) => notes.filter((note) => note.id !== id));
      } else {
        return false;
      }
      changed();
      answer(res);
      return true;
    },
  };
}
