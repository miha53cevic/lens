/** How the diff produced a file. A unit's "new" is a file's "added". */
export type FileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'excluded';

const TONES: Record<FileStatus, string> = {
  added: '[--tone:var(--add)]',
  modified: '[--tone:var(--mod)]',
  deleted: '[--tone:var(--del)]',
  renamed: '[--tone:var(--ren)]',
  excluded: '[--tone:var(--faint)]',
};

const LETTERS: Record<FileStatus, string> = { added: 'A', modified: 'M', deleted: 'D', renamed: 'R', excluded: '⊘' };
const NAMES: Record<FileStatus, string> = {
  added: 'Added',
  modified: 'Modified',
  deleted: 'Deleted',
  renamed: 'Renamed',
  excluded: 'Excluded',
};

/** A file's or a unit's status, as these components name it. */
export function fileStatus(status: string): FileStatus {
  return status === 'new' ? 'added' : (status as FileStatus);
}

/** The status as one colored letter: the tree's rows and the tabs. */
export function StatusLetter({ status }: { status: FileStatus }) {
  return (
    <span
      data-part='status-letter'
      data-status={status}
      className={
        'inline-block w-[12px] flex-none text-center font-mono text-sm leading-none font-semibold text-tone ' +
        TONES[status]
      }
    >
      {LETTERS[status]}
    </span>
  );
}

/** The status spelled out, in its color: a code card's header. */
export function StatusBadge({ status }: { status: FileStatus }) {
  return (
    <span
      data-part='status-badge'
      className={
        'inline-flex flex-none items-center gap-2 rounded-full bg-tone-tint p-1 pr-2 font-sans text-sm/[1.3] font-semibold whitespace-nowrap text-tone ' +
        TONES[status]
      }
    >
      {/* the letter centered by its line box, not by the font's metrics (which sit capitals high or low) */}
      <span className='inline-block size-4 rounded-full bg-tone-tint-strong text-center font-sans text-2xs/[16px] font-bold'>
        {LETTERS[status]}
      </span>
      {NAMES[status]}
    </span>
  );
}
