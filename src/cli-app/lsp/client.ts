import { spawn, type ChildProcess } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// A language server spoken to over stdio: JSON-RPC 2.0 in `Content-Length` frames (the LSP's base
// protocol). It holds only what a reader's hover and click need: open a file at the text lens
// read, ask about a place in it. The server's own requests get an empty answer.

/** ms: past this a request is answered "not known" rather than kept waiting */
const REQUEST_TIMEOUT = 10_000;

/** A place in a file as the LSP counts it: 0-based line, UTF-16 character */
export interface LspPosition {
  line: number;
  character: number;
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface LspClient {
  request(method: string, params: unknown): Promise<unknown>;
  notify(method: string, params: unknown): void;
  /** Opens the file at `text`, or moves it to `text` when it was opened at another */
  sync(path: string, languageId: string, text: string): void;
  /** Whether the process still runs: a server that died is started again by its owner */
  alive(): boolean;
  stop(): void;
}

/** Starts the server at `command` in `root` and initializes it; rejects when it doesn't come up. */
export async function startLsp(command: string, args: string[], root: string): Promise<LspClient> {
  const child: ChildProcess = spawn(command, args, { cwd: root, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  const pending = new Map<number, Pending>();
  const opened = new Map<string, { version: number; text: string }>();
  let nextId = 1;
  let running = true;
  let buffer = Buffer.alloc(0);

  const fail = (reason: string) => {
    running = false;
    for (const call of pending.values()) {
      clearTimeout(call.timer);
      call.reject(new Error(reason));
    }
    pending.clear();
  };
  child.on('error', (error) => fail(error.message));
  child.on('exit', () => fail('the TypeScript server stopped'));

  const send = (message: object) => {
    if (!running) return;
    const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }), 'utf8');
    child.stdin?.write(`Content-Length: ${body.length}\r\n\r\n`);
    child.stdin?.write(body);
  };

  const receive = (message: {
    id?: number | string;
    method?: string;
    result?: unknown;
    error?: { message: string };
  }) => {
    if (message.method !== undefined) {
      // the server asks something of us (configuration, progress tokens, registrations): nothing to give
      if (message.id !== undefined) send({ id: message.id, result: null });
      return;
    }
    const call = typeof message.id === 'number' ? pending.get(message.id) : undefined;
    if (!call) return;
    pending.delete(message.id as number);
    clearTimeout(call.timer);
    if (message.error) call.reject(new Error(message.error.message));
    else call.resolve(message.result ?? null);
  };

  child.stdout?.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const length = /Content-Length: *(\d+)/i.exec(buffer.subarray(0, headerEnd).toString('ascii'));
      if (!length) {
        // not a frame: nothing after it can be read in step
        fail('the TypeScript server sent something that is not LSP');
        child.kill();
        return;
      }
      const start = headerEnd + 4;
      const end = start + Number(length[1]);
      if (buffer.length < end) return;
      const body = buffer.subarray(start, end).toString('utf8');
      buffer = buffer.subarray(end);
      try {
        receive(JSON.parse(body));
      } catch {
        // one frame that isn't JSON is dropped: the next is still in step
      }
    }
  });

  const client: LspClient = {
    request(method, params) {
      if (!running) return Promise.reject(new Error('the TypeScript server stopped'));
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`the TypeScript server took longer than ${REQUEST_TIMEOUT / 1000}s`));
        }, REQUEST_TIMEOUT);
        pending.set(id, { resolve, reject, timer });
        send({ id, method, params });
      });
    },
    notify(method, params) {
      send({ method, params });
    },
    sync(path, languageId, text) {
      const uri = pathToFileURL(path).href;
      const known = opened.get(uri);
      if (known?.text === text) return;
      if (!known) {
        client.notify('textDocument/didOpen', { textDocument: { uri, languageId, version: 1, text } });
        opened.set(uri, { version: 1, text });
      } else {
        const version = known.version + 1;
        client.notify('textDocument/didChange', { textDocument: { uri, version }, contentChanges: [{ text }] });
        opened.set(uri, { version, text });
      }
    },
    alive: () => running,
    stop() {
      if (!running) return;
      // a polite end, then the process goes whether or not it answered
      client
        .request('shutdown', null)
        .catch(() => {})
        .finally(() => {
          client.notify('exit', null);
          running = false;
          child.kill();
        });
      setTimeout(() => child.kill(), 1000).unref();
    },
  };

  const rootUri = pathToFileURL(root).href;
  await client.request('initialize', {
    processId: process.pid,
    rootUri,
    workspaceFolders: [{ uri: rootUri, name: 'root' }],
    capabilities: {
      textDocument: {
        hover: { contentFormat: ['markdown', 'plaintext'] },
        definition: { linkSupport: true },
        synchronization: { didSave: false },
      },
      workspace: { workspaceFolders: true, configuration: true },
    },
  });
  client.notify('initialized', {});
  return client;
}
