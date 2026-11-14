import { Fragment } from 'react';
import { ChevronRight } from 'lucide-react';
import { baseName } from '../../shared.ts';
import { tipAttrs } from '../../../ui/Tip.tsx';

const SEPARATOR = <ChevronRight size={12} className='flex-none text-faint' aria-hidden />;

/**
 * The file's path as an editor's breadcrumb: its folders, the file, and
 * the part of it a summary unit is. A long path gives way in its folders: the name stays whole.
 */
export function Crumbs({ path, scope }: { path: string; scope?: string }) {
  const name = baseName(path);
  const folders = path
    .slice(0, path.length - name.length)
    .split('/')
    .filter(Boolean);
  return (
    <nav
      data-part='code-path'
      aria-label='Path'
      className='flex min-w-0 items-center gap-1 font-mono text-sm'
      {...tipAttrs(path, { cut: true })}
    >
      {folders.length > 0 && (
        <span data-part='dir' className='flex min-w-0 items-center gap-1 overflow-hidden'>
          {folders.map((folder, folderIndex) => (
            <Fragment key={folderIndex}>
              <span data-part='crumb'>{folder}</span>
              {SEPARATOR}
            </Fragment>
          ))}
        </span>
      )}
      <span data-part='crumb-file' className='flex-none font-medium text-text'>
        {name}
      </span>
      {scope && (
        <>
          {SEPARATOR}
          <span data-part='crumb-scope' className='min-w-0 overflow-hidden font-medium text-ellipsis text-text'>
            {scope}
          </span>
        </>
      )}
    </nav>
  );
}
