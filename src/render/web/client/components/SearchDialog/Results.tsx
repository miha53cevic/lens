import type { ReactNode } from 'react';
import clsx from 'clsx';
import { useLens } from '../../store.ts';
import { sourceLines } from '../../shared.ts';
import { jumpToHit } from '../../actions/dialogs.ts';
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
      <div className='search-empty'>
        {trimmed ? 'keep typing — at least 2 characters' : 'search across all ' + files.length + ' loaded files'}
      </div>
    );
  }
  if (hits.length === 0) return <div className='search-empty'>no matches</div>;

  const rows: ReactNode[] = [];
  const definitionCount = hits.filter((hit) => hit.declares).length;
  if (definitionCount > 0) {
    rows.push(
      <div key='defined' className='search-file defined'>
        Defined at <span className='count'>· {definitionCount}</span>
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
        <div key={'file' + hit.fileIndex} className='search-file'>
          {file.file + ' '}
          <span className='count'>· {hitCount}</span>
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
        className={clsx('search-hit', hitIndex === selected && 'selected')}
        data-idx={hitIndex}
        onClick={() => jumpToHit(hit.fileIndex, hit.line)}
      >
        <span className='ln'>{hit.line}</span>
        {hit.declares && (
          <span className='declares'>
            {hit.declares} · <span className='path'>{file.file}</span>
          </span>
        )}
        <span className='preview'>
          {before}
          <span className='match'>{text.substr(hit.column, hit.length)}</span>
          {after}
        </span>
      </div>,
    );
  });
  if (hits.length >= SEARCH_LIMIT) {
    rows.push(
      <div key='limit' className='search-empty'>
        stopped at {SEARCH_LIMIT} matches — refine the query
      </div>,
    );
  }
  return <>{rows}</>;
}
