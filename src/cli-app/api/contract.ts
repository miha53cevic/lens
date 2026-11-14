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
import type { ViewerToken } from '../render/highlight.ts';
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
  /** The reader's switches (~/.lens/settings.json) */
  'POST /api/settings': Endpoint<SettingsRequest, SettingsRequest>;
  /** The reader's view settings, the ones that changed (~/.lens/settings.json) */
  'POST /api/view': Endpoint<ViewSettings, Ok>;
  /** The settings file shown in Finder or Explorer (the server picks the path, never the page) */
  'POST /api/settings/reveal': Endpoint<null, Ok>;
  /** What the viewer measured, while timings are on (src/cli-app/timings.ts) */
  'POST /api/timings': Endpoint<TimingsRequest, Ok>;
  /** What each kind of saved data holds */
  'GET /api/clear': Endpoint<null, ClearInfoResponse>;
  'POST /api/clear': Endpoint<ClearRequest, ClearResponse>;
  /** ⏻ end: the server stops once it has answered */
  'POST /api/shutdown': Endpoint<null, Ok>;
  /** Findings handed to the agent: the code as it is now is what the next read is measured against */
  /** One viewed mark or verdict changed */
  'POST /api/marks': Endpoint<MarkChange, Ok>;
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
  /** The Plan tab: the root's Lavish plans, and whether Lavish is set up */
  'GET /api/plans': Endpoint<null, PlansResponse>;
  /** A plan's Lavish session, opened for the Plan tab's frame */
  'POST /api/plans/open': Endpoint<PlanOpenRequest, PlanOpenResponse>;
  /** A plan's Lavish session, ended as an agent ends one: it opens again without asking */
  'POST /api/plans/end': Endpoint<PlanEndRequest, Ok>;
  /** What TypeScript says of the name at a place: its declaration and doc (behind `typescriptLsp`) */
  'POST /api/lsp/hover': Endpoint<CodePlace, LspHoverResponse>;
  /** Where TypeScript says the name at a place is declared */
  'POST /api/lsp/definition': Endpoint<CodePlace, LspDefinitionResponse>;
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
  'POST /api/view': true,
  'POST /api/settings/reveal': true,
  'POST /api/timings': true,
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
  'GET /api/plans': true,
  'POST /api/plans/open': true,
  'POST /api/plans/end': true,
  'POST /api/lsp/hover': true,
  'POST /api/lsp/definition': true,
};

export interface Ok {
  ok: true;
}

/** What /api/tokens answers: a theme's tokens, and the analysis whose files they are. */
export type TokensResponse = ThemeTokens & { analysis: string };

/**
 * What /api/stamp answers, everything the page watches for in one request: the stored summary's
 * stamp and the key it's read under (another branch checked out moves it), the change's
 * fingerprint as it is on disk now (null when this review has none), the agent's summary run
 * while one is going, and the Plan tab's list as one string (only when asked, `?plans`: else null).
 */
export interface StampResponse {
  summary: number | null;
  key: string | null;
  change: string | null;
  building: BuildProgress | null;
  plans: string | null;
  /** The TypeScript server, while `typescriptLsp` is on; null while it's off */
  lsp: LspStatus | null;
}

export interface SettingsRequest {
  buildPreviews?: boolean;
  selfChecks?: boolean;
  planTab?: boolean;
  typescriptLsp?: boolean;
  timings?: boolean;
}

/**
 * How the reader left the viewer, in any repository: Settings' view settings and the panels.
 * Kept by the server (~/.lens/settings.json), never in the browser. Each is left out until the reader
 * sets it, and the viewer's default holds.
 */
export interface ViewSettings {
  hideTests?: boolean;
  hunksOnly?: boolean;
  fullUnits?: boolean;
  wordDiff?: boolean;
  sideBySide?: boolean;
  /** The fold level picked, with the config's level it was picked over: a new one in the config wins. null forgets it */
  foldLevel?: { level: number; base: number } | null;
  navCollapsed?: boolean;
  /** px */
  navWidth?: number;
  askOpen?: boolean;
  /** px */
  askWidth?: number;
}

/** What POST /api/timings takes: the viewer's steps since its last post */
export interface TimingsRequest {
  timings: { name: string; ms: number; detail?: string }[];
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

/** Whether the Plan tab can use Lavish (plan/lavish.ts) */
export interface LavishSetup {
  /** Where the lavish skill is (`~/.claude/skills/lavish`); null: in none of the places an agent looks */
  skill: string | null;
  /** The node found, by its version; null: none */
  node: string | null;
  /** The major version of node Lavish needs */
  nodeNeeded: number;
  /** How lens runs Lavish's CLI; null: it can't (no node new enough, or neither lavish-axi nor npx) */
  cli: 'lavish-axi' | 'npx' | null;
}

/** One of the root's plans (plan/plans.ts) */
export interface PlanEntry {
  /** From the root, `/`-separated: `.lavish/plan-tab.html` */
  file: string;
  /** Its <title>; null: it has none */
  title: string | null;
  /** When the file last changed, in ms */
  modified: number;
  /** Its Lavish session; null: it never had one */
  session: {
    status: 'open' | 'ended';
    /** The reader ended it from Lavish: it opens again only when they ask (`reopen`) */
    endedByUser: boolean;
    /** How many times the agent rewrote it */
    revision: number;
    /** Feedback sent that no agent has taken yet */
    pending: number;
    /** An agent polls it now; false also when Lavish's server didn't say */
    listening: boolean;
  } | null;
}

export interface PlansResponse {
  setup: LavishSetup;
  plans: PlanEntry[];
  /** The list as one string: what /api/stamp?plans answers */
  stamp: string;
}

export interface PlanOpenRequest {
  file: string;
  reopen: boolean;
}

export interface PlanEndRequest {
  file: string;
}

/** Where the frame loads the session from: the plan proxy (plan/proxy.ts) */
export interface PlanOpenResponse {
  url: string;
}

/** A place in the new side's code: `file` as the payload names it (or absolute, outside the cwd); `line` 1-based, `character` 0-based in UTF-16 units */
export interface CodePlace {
  file: string;
  line: number;
  character: number;
}

/** What TypeScript says of a name: the declaration as it prints it, and its doc comment as markdown ('' for none) */
export interface HoverInfo {
  code: string;
  doc: string;
}

/** `unavailable` says why TypeScript wasn't asked (off, no TypeScript 7, the file on disk isn't the code shown); null when it was */
export interface LspHoverResponse {
  hover: HoverInfo | null;
  /** The hover's code, highlighted in the theme asked for (`?theme=`), a line per line of `hover.code` */
  tokens: ViewerToken[][] | null;
  unavailable: string | null;
}

export interface LspDefinitionResponse {
  places: CodePlace[];
  unavailable: string | null;
}

/**
 * The TypeScript server as the status bar shows it. `missing`: no TypeScript 7 for the repository;
 * `stopped`: it exited (the next question starts it again).
 */
export interface LspStatus {
  state: 'starting' | 'running' | 'stopped' | 'missing';
  /** The TypeScript found, and whose install it is; null when none is */
  version: string | null;
  source: 'repository' | 'lens' | null;
}
