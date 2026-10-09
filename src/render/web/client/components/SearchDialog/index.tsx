// Search in files (⌘P): a palette of every match, ↑ / ↓ to pick, ↵ to jump.

import { Search } from 'lucide-react';
import { useLens } from '../../store.ts';
import { jumpToHit, moveSearchSelection, setSearch } from '../../actions/dialogs.ts';
import { Kbd } from '../../ui/Kbd.tsx';
import { Results } from './Results.tsx';
import { findHits } from './util.ts';
import './style.css';

export function SearchDialog() {
  const { search, hits } = useLens((state) => ({
    search: state.search,
    hits: findHits(state.search.query, state.search.word, state.search.matchCase, state.data.files, state.hideTests),
  }));

  return (
    <dialog id='search-modal' className='palette'>
      <div className='palette-head'>
        <label className='palette-field'>
          <Search size={16} aria-hidden />
          <input
            id='search-input'
            type='text'
            placeholder='Search in files…'
            spellCheck={false}
            autoComplete='off'
            value={search.query}
            onChange={(event) => setSearch({ query: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                moveSearchSelection(event.key === 'ArrowDown' ? 1 : -1, hits.length);
                event.preventDefault();
              } else if (event.key === 'Enter' && hits[search.selected]) {
                jumpToHit(hits[search.selected].fileIndex, hits[search.selected].line);
              }
            }}
          />
        </label>
        <label className='control'>
          <input
            type='checkbox'
            id='search-word'
            checked={search.word}
            onChange={(event) => setSearch({ word: event.target.checked })}
          />{' '}
          word
        </label>
        <label className='control'>
          <input
            type='checkbox'
            id='search-case'
            checked={search.matchCase}
            onChange={(event) => setSearch({ matchCase: event.target.checked })}
          />{' '}
          case
        </label>
      </div>
      <div className='search-results' id='search-results'>
        <Results query={search.query} hits={hits} selected={search.selected} />
      </div>
      <div className='palette-foot'>
        <span>
          <kbd>↑</kbd> <kbd>↓</kbd> navigate
        </span>
        <span>
          <kbd>↵</kbd> jump
        </span>
        <span>
          <kbd>Esc</kbd> close
        </span>
        <span className='spacer' />
        <span>
          tip: <Kbd combo='⌥ click' /> an identifier in the code finds where it's defined and its usages
        </span>
      </div>
    </dialog>
  );
}
