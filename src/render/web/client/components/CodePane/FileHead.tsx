import { baseName, type ViewFile } from '../../shared.ts';
import { StatusBadge } from '../../ui/FileStatus.tsx';
import { FoldChips } from '../FoldChips.tsx';

/** The code card's header: the file's status, its path, how many lines the diff added and removed, its fold chips. */
export function FileHead({ file }: { file: ViewFile }) {
  const name = baseName(file.file);
  const dir = file.file.slice(0, file.file.length - name.length);
  const added = file.changedLines?.length ?? 0;
  const removed = (file.removals || []).reduce((count, block) => count + block.lines.length, 0);

  return (
    <>
      {file.status && <StatusBadge status={file.status} />}
      <span className='code-path' title={file.file}>
        <span className='dir'>{dir}</span>
        <b>{name}</b>
      </span>
      {(added > 0 || removed > 0) && (
        <span className='counts'>
          {added > 0 && <span className='a'>+{added}</span>}
          {removed > 0 && <span className='d'>−{removed}</span>}
        </span>
      )}
      <span className='spacer' />
      <FoldChips />
    </>
  );
}
