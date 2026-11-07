// One thread of highlightPool.ts: tokenizes the sources it is sent, one message each.
import { highlightSides, highlightSource } from './highlight.ts';
import { parentPort } from 'node:worker_threads';
import type { HighlightBatch, HighlightReply } from './highlightPool.ts';

/**
 * Tokenized once as the thread starts, before any message: a thread's first files are about
 * twice as slow as its later ones (the grammar's regexes compile on first use, the JIT warms), and
 * this does that while the analysis still runs. Its tokens are thrown away.
 */
const WARM_UP = `import { useState, type ReactNode } from 'react';
import * as path from 'node:path';

/** A doc comment with a {@link Thing} and \`code\`. */
export interface Props<T extends object = {}> {
  readonly items: T[];
  render?: (item: T, index: number) => ReactNode;
}

type Mode = 'a' | 'b' | \`c-\${string}\`;
enum Kind { One = 1, Two }

export abstract class Store<T> implements Iterable<T> {
  #items = new Map<string, T>();
  static count = 0;
  constructor(private readonly name: string) {}
  get size(): number { return this.#items.size; }
  async *[Symbol.asyncIterator]() { yield* this.#items.values(); }
  *[Symbol.iterator]() { yield* this.#items.values(); }
}

export function List<T extends { id: string }>({ items, render }: Props<T>) {
  const [open, setOpen] = useState<boolean>(false);
  const pattern = /^(?:[a-z]+)\\/\\d{2,}$/giu;
  const label = items.length > 0 ? \`\${items.length} items\` : 'none';
  if (!open) return null;
  return (
    <ul className="list" data-open={open} onClick={() => setOpen((was) => !was)}>
      {items.map((item, index) => (
        <li key={item.id}>{render?.(item, index) ?? <span>{label}</span>}</li>
      ))}
    </ul>
  );
}

export const load = async (file: string): Promise<Mode | undefined> => {
  try {
    const value = (await import(path.join('.', file))) as { mode?: Mode };
    return value?.mode ?? undefined;
  } catch (err: unknown) {
    console.error(\`failed: \${(err as Error).message}\`, Kind.One, 0x1f, 1e3, 10n);
    throw new Error('nope');
  } finally {
    Store.count++;
  }
};
`;

const warmed = (async () => {
  for (const language of ['typescript', 'tsx']) await highlightSource(WARM_UP, language, 'vesper').catch(() => {});
})();

parentPort!.on('message', async ({ batch, jobs, next }: HighlightBatch) => {
  await warmed;
  const counter = new Int32Array(next);
  for (;;) {
    // the next file no thread has taken yet
    const index = Atomics.add(counter, 0, 1);
    if (index >= jobs.length) return;
    const job = jobs[index];
    let reply: HighlightReply;
    try {
      reply = { batch, index, result: await highlightSides(job.source, job.language, job.theme, job.old) };
    } catch (err) {
      reply = { batch, index, error: err instanceof Error ? err.message : String(err) };
    }
    // as text: copying one string beats cloning a big diff's hundreds of thousands of small arrays
    parentPort!.postMessage(JSON.stringify(reply));
  }
});
