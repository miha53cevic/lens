import { Check, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { useLens } from '../../../store.ts';
import { type TreeDir, treeModel } from '../../../model/tree.ts';
import { toggleDir } from '../../../actions/tree.ts';
import { fileNoteKinds } from '../../../model/notes.ts';
import { ListRow } from '../../../../ui/ListRow.tsx';
import { FileRow } from './FileRow.tsx';
import type { TreeContext } from './types.ts';
import { dirState, indentAt, TWISTIE } from './util.ts';

/** The changed files as a folder tree, as VS Code's explorer draws one: dirs first, single-child chains merged. */
export function Tree() {
  const { tree, ...context } = useLens((state) => ({
    tree: treeModel(state),
    closedDirs: state.closedDirs,
    active: state.active,
    files: state.data.files,
    viewedFiles: state.viewedFiles,
    noteKinds: fileNoteKinds(state.notes),
  }));
  if (!tree.hasTree) return null;
  if (tree.filter !== '' && tree.root.dirs.size === 0 && tree.root.files.length === 0) {
    return <div className='no-match'>no files match "{tree.filter}"</div>;
  }
  const rows: ReactNode[] = [];
  addRows(tree.root, '', 0, { ...context, filter: tree.filter }, rows);
  return <>{rows}</>;
}

const DIR_TITLE = { done: 'all viewed', changed: 'all viewed, but a file changed since you viewed it' };

function addRows(node: TreeDir, path: string, depth: number, context: TreeContext, rows: ReactNode[]) {
  for (const dir of node.dirs.values()) {
    const dirPath = path + dir.name + '/';
    const closed = context.filter === '' && context.closedDirs.has(dirPath);
    const through = dirState(dir, context);
    rows.push(
      <ListRow
        key={'dir:' + dirPath}
        data-part='dir'
        data-through={through || undefined}
        aria-expanded={!closed}
        className='flex h-control-xs w-full items-center gap-1 rounded-none pr-3 font-semibold whitespace-nowrap select-none'
        style={{ paddingLeft: indentAt(depth) + 'px' }}
        title={dirPath + (through ? ' — ' + DIR_TITLE[through] : '')}
        onClick={() => toggleDir(dirPath)}
      >
        <span className='inline-grid flex-none place-items-center' style={{ width: TWISTIE + 'px' }}>
          <ChevronRight className={clsx('caret', !closed && 'open')} size={14} />
        </span>
        <span className='min-w-0 flex-1 overflow-hidden text-ellipsis'>{dir.name}</span>
        {through === 'done' && <Check className='ml-2 flex-none text-add' size={12} strokeWidth={2.5} />}
        {through === 'changed' && <span className='dot ml-2 flex-none [--dot:var(--mod)]' />}
      </ListRow>,
    );
    if (closed) continue;
    // its files in one box, which grows open when the reader opens the folder (toggleDir), with
    // the folder's indent guide down the middle of its chevron; brighter when the open file is in it
    const dirRows: ReactNode[] = [];
    addRows(dir, dirPath, depth + 1, context, dirRows);
    const holdsActive = dir.files.some((entry) => entry.index !== null && entry.index === context.active);
    rows.push(
      <div key={'files:' + dirPath} data-dir-files={dirPath} className='relative'>
        <span
          aria-hidden
          data-part='guide'
          data-active={holdsActive || undefined}
          className='pointer-events-none absolute inset-y-0 w-px bg-line data-active:bg-line-strong'
          style={{ left: indentAt(depth) + TWISTIE / 2 + 'px' }}
        />
        {dirRows}
      </div>,
    );
  }
  for (const entry of node.files)
    rows.push(
      <FileRow key={'file:' + entry.path + ':' + entry.status} entry={entry} depth={depth} context={context} />,
    );
}
