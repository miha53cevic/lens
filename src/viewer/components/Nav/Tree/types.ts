import type { ViewFile } from '../../../shared.ts';
import type { NoteKindCount } from '../../../model/notes.ts';

export interface TreeContext {
  filter: string;
  closedDirs: ReadonlySet<string>;
  active: number;
  files: ViewFile[];
  viewedFiles: ReadonlySet<string>;
  noteKinds: ReadonlyMap<string, readonly NoteKindCount[]>;
}
