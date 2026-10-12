import { Folder, LoaderCircle } from 'lucide-react';
// the brand is the viewer header's
import '../../../viewer/components/Header/style.css';
import { useApp } from '../store.ts';
import './Reopening.css';

/**
 * A tab the app reopened, until its review shows: whose it is and that it is coming, in place of
 * Start or the picker. The status bar under it says what runs, and holds the Cancel.
 */
export function Reopening() {
  const name = useApp((state) => state.reopening?.name);
  const review = useApp((state) => state.reopening?.review);
  return (
    <main className='screen reopening' id='reopening' aria-busy='true'>
      <h1 className='brand reopening-brand'>
        lens<em>.</em>
      </h1>
      <p className='reopening-repo'>
        <Folder size={15} />
        <span className='reopening-name'>{name}</span>
        {review && <span className='reopening-review'>{review}</span>}
      </p>
      <p className='reopening-what'>
        <LoaderCircle size={14} className='spin' />
        {review ? 'Reopening the review…' : 'Reading the repository…'}
      </p>
    </main>
  );
}
