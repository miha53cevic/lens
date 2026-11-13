import type { TreeFile } from '../../../model/tree.ts';
import { openFile } from '../../../actions/tabs.ts';
import { toggleFileViewed } from '../../../actions/prefs.ts';
import { fileViewKey } from '../../../shared.ts';
import { changedSinceViewed } from '../../../model/viewed.ts';
import { ViewedBox } from '../../ViewedBox.tsx';
import { StatusLetter } from '../../../../ui/FileStatus.tsx';
import { ListRow } from '../../../../ui/ListRow.tsx';
import { BINARY_TITLE, CHANGED_SINCE_VIEWED, STATUS_TITLE } from '../const.ts';
import { NoteMark } from '../NoteMark.tsx';
import { KindIcon } from './KindIcon.tsx';
import type { TreeContext } from './types.ts';
import { indentAt, TWISTIE } from './util.ts';

/** The open file stays in sight as the reader steps through the tree (j / k, the review pill, a tab). */
function keepInSight(row: HTMLElement | null) {
  row?.scrollIntoView({ block: 'nearest' });
}

export function FileRow({ entry, depth, context }: { entry: TreeFile; depth: number; context: TreeContext }) {
  const fileIndex = entry.index;
  const active = fileIndex !== null && fileIndex === context.active;
  const viewKey = fileIndex !== null ? fileViewKey(context.files[fileIndex]) : null;
  const viewed = viewKey !== null && context.viewedFiles.has(viewKey);
  const changed = viewKey !== null && changedSinceViewed(context.viewedFiles, viewKey);
  const title =
    (entry.status === 'renamed'
      ? entry.renamedFrom + ' → ' + entry.path + ' — ' + STATUS_TITLE.renamed
      : entry.path +
        (entry.status ? ' — ' + STATUS_TITLE[entry.status] : '') +
        (entry.binary ? ', ' + BINARY_TITLE : '')) + (changed ? '\n' + CHANGED_SINCE_VIEWED : '');
  return (
    <ListRow
      ref={active ? keepInSight : undefined}
      selected={active}
      data-part='file'
      data-status={entry.status}
      data-binary={entry.binary ? '' : undefined}
      data-active={active || undefined}
      data-viewed={viewed || undefined}
      className='group/file flex h-control-xs w-full items-center gap-1 rounded-none pr-3 font-mono text-sm text-muted data-selected:shadow-[inset_0_0_0_1px_var(--selected-ring)] data-binary:opacity-60 data-[status=excluded]:opacity-60 disabled:cursor-default disabled:opacity-100 data-binary:disabled:opacity-60 data-[status=excluded]:disabled:opacity-60'
      style={{ paddingLeft: indentAt(depth) + 'px' }}
      title={title}
      disabled={fileIndex === null}
      onClick={fileIndex !== null ? () => openFile(fileIndex) : undefined}
      onDoubleClick={fileIndex !== null ? () => openFile(fileIndex, true) : undefined}
    >
      {/* where a folder has its chevron; a file that can't be opened leaves it empty */}
      <span className='inline-grid flex-none place-items-center' style={{ width: TWISTIE + 'px' }}>
        {fileIndex !== null && (
          <ViewedBox checked={viewed} changed={changed} onToggle={() => toggleFileViewed(fileIndex)} />
        )}
      </span>
      <KindIcon name={entry.name} />
      <span
        data-part='fname'
        className='min-w-0 flex-1 overflow-hidden text-left text-ellipsis whitespace-nowrap group-data-viewed/file:opacity-55 group-data-[status=deleted]/file:line-through group-data-[status=deleted]/file:decoration-del group-data-[status=excluded]/file:italic'
      >
        <FilterMatch name={entry.name} filter={context.filter} />
        {entry.binary && (
          <span data-part='kind' className='ml-2 font-sans text-xs text-faint'>
            binary
          </span>
        )}
      </span>
      {/* one cell: a row without notes keeps the letter where it was */}
      <span className='ml-2 inline-flex min-w-[12px] flex-none items-center justify-end gap-2'>
        <NoteMark kinds={context.noteKinds.get(entry.path)} />
        {entry.status && <StatusLetter status={entry.status} />}
      </span>
    </ListRow>
  );
}

/** The filter match in the file name (a match on the full path may not show here). */
function FilterMatch({ name, filter }: { name: string; filter: string }) {
  const matchAt = filter === '' ? -1 : name.toLowerCase().indexOf(filter);
  if (matchAt === -1) return <>{name}</>;
  return (
    <>
      {name.slice(0, matchAt)}
      <span className='text-accent'>{name.slice(matchAt, matchAt + filter.length)}</span>
      {name.slice(matchAt + filter.length)}
    </>
  );
}
