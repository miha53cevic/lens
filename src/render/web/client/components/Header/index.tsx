import { TopBar } from './TopBar.tsx';
import { Toolbar } from './Toolbar.tsx';

/** The header: the top bar (view switch, stats, session buttons) and the toolbar (folds, toggles). */
export function Header() {
  return (
    <header>
      <TopBar />
      <Toolbar />
    </header>
  );
}
