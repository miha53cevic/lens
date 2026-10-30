// The viewer server's API: every endpoint the page calls, with what it takes and what it answers.
// The server registers each one against this map (api/router.ts) and the viewer calls them by the
// same names (`api()` in src/viewer/actions/status.ts), so a shape changed on one side breaks the
// other's typecheck instead of the page. `lens ask`'s own endpoints and the preview frames aren't
// the page's calls, so they aren't here.

import type { AskQuestion, AskSelection, AskState } from '../ask/session.ts';
import type { ClearKindInfo, ClearPlan, ClearScope } from '../clear.ts';
import type { MarkChange } from '../marks/store.ts';
import type { ReaderNote } from '../notes/store.ts';
import type { ThemeTokens, ViewerPayload } from '../render/web/server.ts';
import type { BuildProgress } from '../summary/progress.ts';
import type { Concern } from '../summary/store.ts';
import type { SummaryView } from '../summary/view.ts';

/** One endpoint: its JSON body (null: none) and its JSON answer. */
interface Endpoint<Body, Answer> {
  body: Body;
  answer: Answer;
}

/** Each endpoint, by its method and path. A `:id` segment is filled in by the caller. */
export interface ApiRoutes {
  /** A theme's tokens for the files of the analysis the server has now (`?theme=`) */
  'GET /api/tokens': Endpoint<null, TokensResponse>;
  /** ↻: analyze again, and the page's payload for it (`?theme=`) */
  'GET /api/refresh': Endpoint<null, ViewerPayload>;
  /** The summary as stored now */
  'GET /api/summary': Endpoint<null, SummaryView | null>;
  /** Everything the page watches for, in one request */
  'GET /api/stamp': Endpoint<null, StampResponse>;
  /** The Build previews switch */
  'POST /api/settings': Endpoint<SettingsRequest, SettingsRequest>;
  /** What each kind of saved data holds */
  'GET /api/clear': Endpoint<null, ClearInfoResponse>;
  'POST /api/clear': Endpoint<ClearRequest, ClearResponse>;
  /** ⏻ end: the server stops once it has answered */
  'POST /api/shutdown': Endpoint<null, Ok>;
  /** One viewed mark or verdict changed */
  'POST /api/marks': Endpoint<MarkChange, Ok>;
  /** A new note */
  'POST /api/notes': Endpoint<NewNote, NotesResponse>;
  /** A note's kind or text, edited */
  'POST /api/notes/:id': Endpoint<NoteEdit, NotesResponse>;
  /** A note resolved: it goes */
  'DELETE /api/notes/:id': Endpoint<null, NotesResponse>;
  /** The Ask rail's chat (polled) */
  'GET /api/ask': Endpoint<null, AskState>;
  /** A question for the listening agent */
  'POST /api/ask': Endpoint<AskRequest, AskQuestion>;
  /** The same question as text, for the clipboard */
  'POST /api/ask/prompt': Endpoint<AskRequest, AskPromptResponse>;
}

export type ApiRoute = keyof ApiRoutes;
export type ApiBody<R extends ApiRoute> = ApiRoutes[R]['body'];
export type ApiAnswer<R extends ApiRoute> = ApiRoutes[R]['answer'];

/** Every route, at run time: test/api.test.ts checks the server serves each, and the viewer calls no other. */
export const API_ROUTES: { readonly [R in ApiRoute]: true } = {
  'GET /api/tokens': true,
  'GET /api/refresh': true,
  'GET /api/summary': true,
  'GET /api/stamp': true,
  'POST /api/settings': true,
  'GET /api/clear': true,
  'POST /api/clear': true,
  'POST /api/shutdown': true,
  'POST /api/marks': true,
  'POST /api/notes': true,
  'POST /api/notes/:id': true,
  'DELETE /api/notes/:id': true,
  'GET /api/ask': true,
  'POST /api/ask': true,
  'POST /api/ask/prompt': true,
};

export interface Ok {
  ok: true;
}

/** What /api/tokens answers: a theme's tokens, and the analysis whose files they are. */
export type TokensResponse = ThemeTokens & { analysis: string };

/**
 * What /api/stamp answers, everything the page watches for in one request: the stored summary's
 * stamp and the key it's read under (another branch checked out moves it), the change's
 * fingerprint as it is on disk now (null when this review has none), and the agent's summary run
 * while one is going.
 */
export interface StampResponse {
  summary: number | null;
  key: string | null;
  change: string | null;
  building: BuildProgress | null;
}

export interface SettingsRequest {
  buildPreviews: boolean;
}

/** What GET /api/clear answers: what each kind would remove */
export interface ClearInfoResponse {
  kinds: ClearKindInfo[];
}

/** What POST /api/clear takes: each kind to clear, with its scope */
export interface ClearRequest {
  picks: Record<string, ClearScope>;
}

/** What POST /api/clear answers: what it removed, and the summary as it is now */
export interface ClearResponse {
  cleared: Record<string, ClearPlan>;
  summary: SummaryView | null;
}

/** What the notes' endpoints answer: every note on the review's files */
export interface NotesResponse {
  notes: ReaderNote[];
}

/** What POST /api/notes takes */
export type NewNote = Pick<ReaderNote, 'file' | 'side' | 'start' | 'end' | 'lines' | 'kind' | 'text'>;

/** What POST /api/notes/<id> takes */
export type NoteEdit = Pick<ReaderNote, 'kind' | 'text'>;

/** A question as the viewer sends it: the server keeps only the findings the unit really has. */
export interface AskRequest {
  text: string;
  file: string;
  unitId: string | null;
  label: string;
  selection: AskSelection | null;
  /** The unit's open concerns, as the summary has them */
  concerns: Concern[];
  /** Its open possible breaks, named by what they say */
  breaks: string[];
}

export interface AskPromptResponse {
  text: string;
}
