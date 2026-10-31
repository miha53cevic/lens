// Search in files (⌘P): a palette of every match, ↑ / ↓ to pick, ↵ to jump. Its files mode (⌘⇧P)
// matches the files' paths instead, and ↵ opens one.

import { Search } from 'lucide-react';
import { useLens } from '../../store.ts';
import { jumpToHit, moveSearchSelection, openFoundFile, setSearch } from '../../actions/dialogs.ts';
import { Chip } from '../../../ui/Chip.tsx';
import { Field } from '../../../ui/Field.tsx';
import { Kbd } from '../../../ui/Kbd.tsx';
import { Results } from './Results.tsx';
import { FileResults } from './FileResults.tsx';
import { findFiles, findHits, type SearchHit } from './util.ts';
import './style.css';

// what the mode that isn't on finds: the same array each time, so the selector's answer stays equal
const NO_HITS: SearchHit[] = [];
const NO_FILES: number[] = [];

export function SearchDialog() {
  const { search, hits, found } = useLens((state) => ({
    search: state.search,
    hits: state.search.files
      ? NO_HITS
      : findHits(state.search.query, state.search.word, state.search.matchCase, state.data.files, state.hideTests),
    found: state.search.files ? findFiles(state.search.query, state.data.files, state.hideTests) : NO_FILES,
  }));
  const count = search.files ? found.length : hits.length;

  return (
    <dialog id='search-modal' className='palette'>
      <div className='palette-head'>
        <Field
          size='lg'
          className='palette-field'
          icon={<Search size={16} aria-hidden />}
          id='search-input'
          placeholder={search.files ? 'Find a file by its path…' : 'Search in files…'}
          value={search.query}
          onChange={(event) => setSearch({ query: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              moveSearchSelection(event.key === 'ArrowDown' ? 1 : -1, count);
              event.preventDefault();
            } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              if (search.files && found[search.selected] !== undefined) openFoundFile(found[search.selected]);
              else if (!search.files && hits[search.selected]) {
                jumpToHit(hits[search.selected].fileIndex, hits[search.selected].line);
              }
            }
          }}
        />
        <Chip id='search-files' checked={search.files} onChange={(files) => setSearch({ files })}>
          files
        </Chip>
        {/* a path is matched in any case, and a part of a name is what's typed */}
        {!search.files && (
          <>
            <Chip id='search-word' checked={search.word} onChange={(word) => setSearch({ word })}>
              word
            </Chip>
            <Chip id='search-case' checked={search.matchCase} onChange={(matchCase) => setSearch({ matchCase })}>
              case
            </Chip>
          </>
        )}
      </div>
      <div className='search-results' id='search-results'>
        {search.files ? (
          <FileResults query={search.query} found={found} selected={search.selected} />
        ) : (
          <Results query={search.query} hits={hits} selected={search.selected} />
        )}
      </div>
      <div className='palette-foot'>
        <span>
          <Kbd size='sm' combo='↑ ↓' /> navigate
        </span>
        <span>
          <Kbd size='sm' combo='↵' /> {search.files ? 'open' : 'jump'}
        </span>
        <span>
          <Kbd size='sm' combo='Esc' /> close
        </span>
        <span className='spacer' />
        {search.files ? (
          <span>
            <Kbd size='sm' combo='⌘⇧P' /> opens here
          </span>
        ) : (
          <span>
            tip: <Kbd combo='⌥ click' /> an identifier in the code finds where it's defined and its usages
          </span>
        )}
      </div>
    </dialog>
  );
}
