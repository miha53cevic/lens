import { useLens } from '../../store.ts';
import { openFoundFile } from '../../actions/dialogs.ts';
import { StatusLetter } from '../../../ui/FileStatus.tsx';
import { listRowClass } from '../../../ui/ListRow.tsx';
import { FILE_LIMIT } from './util.ts';

interface FileResultsProps {
  query: string;
  found: number[];
  selected: number;
}

/** The files mode's list: each path, the match marked in it. */
export function FileResults({ query, found, selected }: FileResultsProps) {
  const files = useLens((state) => state.data.files);
  const wanted = query.trim().toLowerCase();
  if (wanted === '') return <div className='no-match'>find one of the {files.length} files by its path</div>;
  if (found.length === 0) return <div className='no-match'>no files match</div>;
  return (
    <>
      {found.map((fileIndex, rowIndex) => {
        const file = files[fileIndex];
        // the match in the name when the name has it, else its first place in the path
        const nameAt = file.file.lastIndexOf('/') + 1;
        const inName = file.file.toLowerCase().indexOf(wanted, nameAt);
        const at = inName !== -1 ? inName : file.file.toLowerCase().indexOf(wanted);
        return (
          <div
            key={fileIndex}
            className={listRowClass(rowIndex === selected, 'search-hit search-path')}
            onClick={() => openFoundFile(fileIndex)}
          >
            {file.status && <StatusLetter status={file.status} />}
            <span className='preview'>
              {file.file.slice(0, at)}
              <span className='match'>{file.file.slice(at, at + wanted.length)}</span>
              {file.file.slice(at + wanted.length)}
            </span>
          </div>
        );
      })}
      {found.length >= FILE_LIMIT && <div className='no-match'>the first {FILE_LIMIT} — type more of the path</div>}
    </>
  );
}
