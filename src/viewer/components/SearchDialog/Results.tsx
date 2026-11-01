import type { ReactNode } from 'react';
import { useLens } from '../../store.ts';
import { sourceLines } from '../../shared.ts';
import { jumpToHit } from '../../actions/dialogs.ts';
import { listRow } from '../../../ui/ListRow.tsx';
import { SEARCH_LIMIT, type SearchHit } from './util.ts';

interface ResultsProps {
  query: string;
  hits: SearchHit[];
  selected: number;
}

/** The definitions first, then the usages grouped by file: the line number and the line around the match. */
export function Results({ query, hits, selected }: ResultsProps) {
  const files = useLens((state) => state.data.files);
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return (
      <div className='no-match'>
        {trimmed ? 'keep typing — at least 2 characters' : 'search across all ' + files.length + ' loaded files'}
      </div>
    );
  }
  if (hits.length === 0) return <div className='no-match'>no matches</div>;

  const rows: ReactNode[] = [];
  const definitionCount = hits.filter((hit) => hit.declares).length;
  if (definitionCount > 0) {
    rows.push(
      <div
        key='defined'
        className='overflow-hidden px-4 pt-2 pb-1 font-mono text-xs text-ellipsis whitespace-nowrap text-muted font-sans font-semibold text-accent'
        data-part='search-file'
        data-defined=''
      >
        Defined at <span className='text-faint'>· {definitionCount}</span>
      </div>,
    );
  }
  let lastFileIndex = -1;
  hits.forEach((hit, hitIndex) => {
    const file = files[hit.fileIndex];
    if (!hit.declares && hit.fileIndex !== lastFileIndex) {
      lastFileIndex = hit.fileIndex;
      const hitCount = hits.filter((other) => !other.declares && other.fileIndex === hit.fileIndex).length;
      rows.push(
        <div
          key={'file' + hit.fileIndex}
          className='overflow-hidden px-4 pt-2 pb-1 font-mono text-xs text-ellipsis whitespace-nowrap text-muted'
        >
          {file.file + ' '}
          <span className='text-faint'>· {hitCount}</span>
        </div>,
      );
    }
    const text = sourceLines(file)[hit.line - 1] ?? '';
    const from = hit.column > 80 ? hit.column - 60 : 0;
    const before = ((from > 0 ? '…' : '') + text.slice(from, hit.column)).replace(/^\s+/, '');
    const after = text.slice(hit.column + hit.length, hit.column + hit.length + 160);
    rows.push(
      <div
        key={hitIndex}
        {...listRow(
          hitIndex === selected,
          'group/hit mx-2 flex cursor-pointer items-baseline gap-2 overflow-hidden rounded-md py-1 pr-3 pl-6 font-mono text-sm whitespace-pre',
        )}
        data-part='search-hit'
        onClick={() => jumpToHit(hit.fileIndex, hit.line)}
      >
        <span className='min-w-[3.2ch] flex-none text-right text-faint'>{hit.line}</span>
        {hit.declares && (
          <span className='max-w-[40%] flex-none overflow-hidden text-xs text-ellipsis whitespace-nowrap text-faint'>
            {hit.declares} ·{' '}
            <span data-part='path' className='text-muted'>
              {file.file}
            </span>
          </span>
        )}
        <span className='overflow-hidden text-ellipsis text-muted group-data-selected/hit:text-text'>
          {before}
          <span className='font-bold text-accent'>{text.substr(hit.column, hit.length)}</span>
          {after}
        </span>
      </div>,
    );
  });
  if (hits.length >= SEARCH_LIMIT) {
    rows.push(
      <div key='limit' className='no-match'>
        stopped at {SEARCH_LIMIT} matches — refine the query
      </div>,
    );
  }
  return <>{rows}</>;
}
