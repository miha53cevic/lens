import { Check, ChevronDown } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useLens } from '../../store.ts';
import { switchTheme } from '../../actions/session.ts';
import { writePref } from '../../shared.ts';
import { Menu, MenuItem, MenuSection } from '../../ui/Menu.tsx';

/** The code theme: each with its background, so light and dark show before picking. The whole page follows it. */
export function ThemeMenu() {
  const { theme, themes, busy } = useLens((state) => ({
    theme: state.data.theme,
    themes: state.data.themes,
    busy: state.themeBusy,
  }));

  return (
    <Menu
      id='theme-btn'
      label={'Code theme: ' + theme}
      triggerClass='theme-trigger'
      className='theme-menu'
      trigger={
        <>
          <span className='swatch current' />
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
            icon={
              <span className='swatch' style={{ '--swatch-bg': swatch.bg, color: swatch.accent } as CSSProperties} />
            }
            onSelect={async () => {
              if (swatch.name !== theme && (await switchTheme(swatch.name))) writePref('lens.theme', swatch.name);
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
