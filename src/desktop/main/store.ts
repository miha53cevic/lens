// What the app remembers between runs: the folders you opened, and the port each repository's
// viewer gets. Nothing about branches or past reviews, so nothing here can go stale.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

interface Stored {
  /** Repository roots, most recent first */
  recents: string[];
  /**
   * The viewer's port per repository. It stays the same between runs: the viewer keeps its
   * viewed marks in localStorage, which the browser files under the page's port.
   */
  ports: Record<string, number>;
}

const MAX_RECENTS = 12;

function read(file: string): Stored {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    const recents = Array.isArray(raw?.recents) ? raw.recents.filter((root: unknown) => typeof root === 'string') : [];
    const ports: Record<string, number> = {};
    for (const [root, port] of Object.entries(raw?.ports ?? {})) {
      if (Number.isInteger(port)) ports[root] = port as number;
    }
    return { recents, ports };
  } catch {
    return { recents: [], ports: {} }; // no file yet, or not one the app wrote
  }
}

export interface Store {
  /** The recent repositories that still exist, most recent first. */
  recents(): string[];
  /** Puts a repository first in the recents. */
  touch(root: string): void;
  forget(root: string): void;
  port(root: string): number | null;
  setPort(root: string, port: number): void;
}

export function openStore(file: string): Store {
  let stored = read(file);
  const save = () => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(stored, null, 2) + '\n');
  };
  return {
    recents() {
      const existing = stored.recents.filter((root) => existsSync(root));
      if (existing.length !== stored.recents.length) {
        // a folder that is gone is dropped for good, its port with it
        const ports = Object.fromEntries(Object.entries(stored.ports).filter(([root]) => existing.includes(root)));
        stored = { recents: existing, ports };
        save();
      }
      return existing;
    },
    touch(root) {
      stored = {
        ...stored,
        recents: [root, ...stored.recents.filter((other) => other !== root)].slice(0, MAX_RECENTS),
      };
      save();
    },
    forget(root) {
      const { [root]: _port, ...ports } = stored.ports;
      stored = { recents: stored.recents.filter((other) => other !== root), ports };
      save();
    },
    port: (root) => stored.ports[root] ?? null,
    setPort(root, port) {
      stored = { ...stored, ports: { ...stored.ports, [root]: port } };
      save();
    },
  };
}
