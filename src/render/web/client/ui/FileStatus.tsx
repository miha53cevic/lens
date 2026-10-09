import './FileStatus.css';

/** How the diff produced a file. A unit's "new" is a file's "added". */
export type FileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'excluded';

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
export function StatusLetter({ status, title }: { status: FileStatus; title?: string }) {
  return (
    <span className={'status-letter st-' + status} title={title}>
      {LETTERS[status]}
    </span>
  );
}

/** The status spelled out, in its color: a code card's header. */
export function StatusBadge({ status, note }: { status: FileStatus; note?: string }) {
  return (
    <span className={'status-badge st-' + status}>
      <span className='letter'>{LETTERS[status]}</span>
      {NAMES[status] + (note ? ' · ' + note : '')}
    </span>
  );
}
