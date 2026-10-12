import { useLens } from '../../store.ts';
import { saveTheme, switchTheme } from '../../actions/session.ts';
import { isBusy } from '../../model/status.ts';
import { ThemeMenu as ThemeMenuControl } from '../../../ui/ThemeMenu.tsx';

/** The code theme (ui/ThemeMenu), on the viewer's state: a pick fetches the theme's tokens, then is remembered. */
export function ThemeMenu() {
  const theme = useLens((state) => state.data.theme);
  const themes = useLens((state) => state.data.themes);
  const busy = useLens((state) => isBusy(state, 'theme'));
  return (
    <ThemeMenuControl
      theme={theme}
      themes={themes}
      busy={busy}
      onPick={async (name) => {
        if (await switchTheme(name)) saveTheme(name);
      }}
    />
  );
}
