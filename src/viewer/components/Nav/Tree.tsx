import { Check, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { useLens } from '../../store.ts';
import { type TreeDir, type TreeFile, treeModel } from '../../model/tree.ts';
import { openFile } from '../../actions/tabs.ts';
import { toggleDir, toggleFileViewed } from '../../actions/prefs.ts';
import { fileViewKey, type ViewFile } from '../../shared.ts';
import { ViewedBox } from '../ViewedBox.tsx';
import { StatusLetter } from '../../../ui/FileStatus.tsx';
import { ListRow } from '../../../ui/ListRow.tsx';
import { BINARY_TITLE, CHANGED_SINCE_VIEWED, STATUS_TITLE } from './const.ts';
import { changedSinceViewed } from '../../model/viewed.ts';
import { noteCounts } from '../../model/notes.ts';
import { NoteMark } from './NoteMark.tsx';

interface TreeContext {
  filter: string;
  closedDirs: ReadonlySet<string>;
  active: number;
  files: ViewFile[];
  viewedFiles: ReadonlySet<string>;
  noteCounts: ReadonlyMap<string, number>;
}

/** The changed files as a folder tree: dirs first, single-child chains merged. */
export function Tree() {
  const { tree, ...context } = useLens((state) => ({
    tree: treeModel(state),
    closedDirs: state.closedDirs,
    active: state.active,
    files: state.data.files,
    viewedFiles: state.viewedFiles,
    noteCounts: noteCounts(state.notes),
  }));
  if (!tree.hasTree) return null;
  if (tree.filter !== '' && tree.root.dirs.size === 0 && tree.root.files.length === 0) {
    return <div className='no-match'>no files match "{tree.filter}"</div>;
  }
  const rows: ReactNode[] = [];
  addRows(tree.root, '', 0, { ...context, filter: tree.filter }, rows);
  return <>{rows}</>;
}

/**
 * Whether the reader is through a folder: 'done' when every file under it that opens is viewed,
 * 'changed' when each was viewed but some changed since (its mark is keyed by content, so it counts
 * as not viewed again), else null. Under a filter the tree shows only some of a folder: null.
 */
function dirState(dir: TreeDir, context: TreeContext): 'done' | 'changed' | null {
  if (context.filter !== '') return null;
  let opened = 0;
  let changed = 0;
  const walk = (node: TreeDir): boolean => {
    for (const entry of node.files) {
      if (entry.index === null) continue;
      opened++;
      const key = fileViewKey(context.files[entry.index]);
      if (context.viewedFiles.has(key)) continue;
      if (!changedSinceViewed(context.viewedFiles, key)) return false;
      changed++;
    }
    return [...node.dirs.values()].every(walk);
  };
  if (!walk(dir) || opened === 0) return null;
  return changed > 0 ? 'changed' : 'done';
}

const DIR_TITLE = { done: 'all viewed', changed: 'all viewed, but a file changed since you viewed it' };

function addRows(node: TreeDir, path: string, depth: number, context: TreeContext, rows: ReactNode[]) {
  const indent = 8 + depth * 13;
  for (const dir of node.dirs.values()) {
    const dirPath = path + dir.name + '/';
    const closed = context.filter === '' && context.closedDirs.has(dirPath);
    const through = dirState(dir, context);
    rows.push(
      <div
        key={'dir:' + dirPath}
        data-part='dir'
        data-through={through || undefined}
        className='flex cursor-pointer items-center gap-2 overflow-hidden px-2 py-1 font-semibold text-ellipsis whitespace-nowrap text-muted select-none hover:text-text'
        style={{ paddingLeft: indent + 'px' }}
        title={dirPath + (through ? ' — ' + DIR_TITLE[through] : '')}
        onClick={() => toggleDir(dirPath)}
      >
        <ChevronRight className={clsx('caret', !closed && 'open')} size={12} />
        <span className='overflow-hidden text-ellipsis'>{dir.name}</span>
        {through === 'done' && <Check className='ml-auto flex-none text-add' size={12} strokeWidth={2.5} />}
        {through === 'changed' && <span className='dot ml-auto flex-none [--dot:var(--mod)]' />}
      </div>,
    );
    if (closed) continue;
    // its files in one box, which grows open when the reader opens the folder (toggleDir)
    const dirRows: ReactNode[] = [];
    addRows(dir, dirPath, depth + 1, context, dirRows);
    rows.push(
      <div key={'files:' + dirPath} data-dir-files={dirPath}>
        {dirRows}
      </div>,
    );
  }
  for (const entry of node.files)
    rows.push(
      <FileRow key={'file:' + entry.path + ':' + entry.status} entry={entry} indent={indent + 13} context={context} />,
    );
}

/** The open file stays in sight as the reader steps through the tree (j / k, the review pill, a tab). */
function keepInSight(row: HTMLElement | null) {
  row?.scrollIntoView({ block: 'nearest' });
}

function FileRow({ entry, indent, context }: { entry: TreeFile; indent: number; context: TreeContext }) {
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
      className='group/file grid w-full grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1 text-left font-mono text-sm/[1.5] text-muted data-binary:opacity-60 data-[status=excluded]:opacity-60 disabled:cursor-default disabled:opacity-100 data-binary:disabled:opacity-60 data-[status=excluded]:disabled:opacity-60'
      style={{ paddingLeft: indent + 'px' }}
      title={title}
      disabled={fileIndex === null}
      onClick={fileIndex !== null ? () => openFile(fileIndex) : undefined}
      onDoubleClick={fileIndex !== null ? () => openFile(fileIndex, true) : undefined}
    >
      {/* files that can't be opened keep the box's width, so names stay aligned */}
      {fileIndex !== null ? (
        <ViewedBox checked={viewed} changed={changed} onToggle={() => toggleFileViewed(fileIndex)} />
      ) : (
        <span className='invisible inline-grid size-[13px] flex-none' />
      )}
      <span
        data-part='fname'
        className='overflow-hidden text-ellipsis whitespace-nowrap group-data-viewed/file:opacity-55 group-data-[status=deleted]/file:line-through group-data-[status=deleted]/file:decoration-del group-data-[status=excluded]/file:italic'
      >
        <FilterMatch name={entry.name} filter={context.filter} />
        {entry.binary && (
          <span data-part='kind' className='ml-2 font-sans text-xs text-faint'>
            binary
          </span>
        )}
      </span>
      {/* one cell: a row without notes keeps the letter where it was */}
      <span className='inline-flex min-w-[12px] items-center justify-end gap-2'>
        <NoteMark count={context.noteCounts.get(entry.path) ?? 0} />
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
