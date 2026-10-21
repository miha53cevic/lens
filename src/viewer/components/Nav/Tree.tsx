import { ChevronRight } from 'lucide-react';
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
import { BINARY_TITLE, STATUS_TITLE } from './const.ts';

interface TreeContext {
  filter: string;
  closedDirs: ReadonlySet<string>;
  active: number;
  files: ViewFile[];
  viewedFiles: ReadonlySet<string>;
}

/** The changed files as a folder tree: dirs first, single-child chains merged. */
export function Tree() {
  const { tree, ...context } = useLens((state) => ({
    tree: treeModel(state),
    closedDirs: state.closedDirs,
    active: state.active,
    files: state.data.files,
    viewedFiles: state.viewedFiles,
  }));
  if (!tree.hasTree) return null;
  if (tree.filter !== '' && tree.root.dirs.size === 0 && tree.root.files.length === 0) {
    return <div className='no-match'>no files match "{tree.filter}"</div>;
  }
  const rows: ReactNode[] = [];
  addRows(tree.root, '', 0, { ...context, filter: tree.filter }, rows);
  return <>{rows}</>;
}

function addRows(node: TreeDir, path: string, depth: number, context: TreeContext, rows: ReactNode[]) {
  const indent = 8 + depth * 13;
  for (const dir of node.dirs.values()) {
    const dirPath = path + dir.name + '/';
    const closed = context.filter === '' && context.closedDirs.has(dirPath);
    rows.push(
      <div
        key={'dir:' + dirPath}
        className='dir'
        style={{ paddingLeft: indent + 'px' }}
        title={dirPath}
        onClick={() => toggleDir(dirPath)}
      >
        <ChevronRight className={clsx('caret', !closed && 'open')} size={12} />
        {dir.name}
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
  const viewed = fileIndex !== null && context.viewedFiles.has(fileViewKey(context.files[fileIndex]));
  const title =
    entry.status === 'renamed'
      ? entry.renamedFrom + ' → ' + entry.path + ' — ' + STATUS_TITLE.renamed
      : entry.path +
        (entry.status ? ' — ' + STATUS_TITLE[entry.status] : '') +
        (entry.binary ? ', ' + BINARY_TITLE : '');
  return (
    <ListRow
      ref={active ? keepInSight : undefined}
      selected={active}
      className={clsx('file', entry.status, entry.binary && 'binary', active && 'active', viewed && 'viewed')}
      style={{ paddingLeft: indent + 'px' }}
      title={title}
      disabled={fileIndex === null}
      onClick={fileIndex !== null ? () => openFile(fileIndex) : undefined}
      onDoubleClick={fileIndex !== null ? () => openFile(fileIndex, true) : undefined}
    >
      {/* files that can't be opened keep the box's width, so names stay aligned */}
      {fileIndex !== null ? (
        <ViewedBox checked={viewed} onToggle={() => toggleFileViewed(fileIndex)} />
      ) : (
        <span className='viewed-box placeholder' />
      )}
      <span className='fname'>
        <FilterMatch name={entry.name} filter={context.filter} />
        {entry.binary && <span className='kind'>binary</span>}
      </span>
      {entry.status && <StatusLetter status={entry.status} />}
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
      <span className='hl'>{name.slice(matchAt, matchAt + filter.length)}</span>
      {name.slice(matchAt + filter.length)}
    </>
  );
}
