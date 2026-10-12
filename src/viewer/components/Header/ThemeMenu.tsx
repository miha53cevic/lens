import { Check, ChevronDown } from 'lucide-react';
import { useLens } from '../../store.ts';
import { saveTheme, switchTheme } from '../../actions/session.ts';
import { isBusy } from '../../model/status.ts';
import { Menu, MenuItem, MenuSection } from '../../../ui/Menu.tsx';
import { Swatch } from '../../../ui/Swatch.tsx';

/** The code theme: each with its background, so light and dark show before picking. The whole page follows it. */
export function ThemeMenu() {
  const { theme, themes, busy } = useLens((state) => ({
    theme: state.data.theme,
    themes: state.data.themes,
    busy: isBusy(state, 'theme'),
  }));

  return (
    <Menu
      id='theme-btn'
      label={'Code theme: ' + theme}
      triggerClass='theme-trigger'
      className='theme-menu'
      trigger={
        <>
          <Swatch />
          <ChevronDown size={13} />
        </>
      }
    >
      <MenuSection title='Code theme'>
        {themes.map((swatch) => (
          <MenuItem
            key={swatch.name}
            id={'theme-' + swatch.name}
            disabled={busy}
            icon={<Swatch bg={swatch.bg} accent={swatch.accent} />}
            onSelect={async () => {
              if (swatch.name !== theme && (await switchTheme(swatch.name))) saveTheme(swatch.name);
            }}
          >
            {swatch.name}
            {swatch.name === theme && <Check size={13} className='theme-check' />}
          </MenuItem>
        ))}
      </MenuSection>
    </Menu>
  );
}
