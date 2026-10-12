import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { runningServer } from "./ask/discovery.ts";

// The viewer's port when --port isn't given: each repository has its own, the same on every run.
// Two reviews then run side by side, and a repository's page keeps what the browser files under
// its port (the viewed marks and the concerns' verdicts, in localStorage).

/** The ports repositories are spread over: 5400 to 6399. */
const FIRST_PORT = 5400;
const PORT_COUNT = 1000;
/** How many ports after a repository's own are tried when something else holds it. */
const PORT_TRIES = 50;

/** The port `root` gets: from its path, so it is the same every time. */
export function repoPort(root: string): number {
  return FIRST_PORT + (createHash("sha256").update(root).digest().readUInt32BE(0) % PORT_COUNT);
}

/** Whether nothing listens on `port` right now. */
function isFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
  });
}

/**
 * The port to serve `root`'s viewer on: its own, or the next free one when another program has
 * it. A viewer that already runs for `root` is an error that names it, not a second viewer.
 */
export async function pickPort(root: string): Promise<number> {
  const running = runningServer(root);
  if (running) {
    throw new Error(`this repository is already open on http://127.0.0.1:${running.port}/ ` +
      `(refresh it with ↻), or pick another port with --port`);
  }
  const first = repoPort(root);
  for (let port = first; port < first + PORT_TRIES; port++) {
    if (await isFree(port)) return port;
  }
  throw new Error(`no free port from ${first} to ${first + PORT_TRIES - 1} — pick one with --port`);
}
