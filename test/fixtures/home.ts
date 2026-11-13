// Preloaded before every test file (bunfig.toml): the reader's own folder (~/.lens, settings.ts)
// is a fresh temp folder, so no test reads or writes the real one. Child processes inherit it.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.LENS_HOME = mkdtempSync(join(tmpdir(), 'lens-home-'));
// and Settings' reveal leaves Finder / Explorer closed (summary/settings.ts)
process.env.LENS_NO_REVEAL = '1';
