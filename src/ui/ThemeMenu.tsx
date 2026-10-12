import { Check, ChevronDown } from 'lucide-react';
import { Menu, MenuItem, MenuSection } from './Menu.tsx';
import { Swatch } from './Swatch.tsx';
import './ThemeMenu.css';

/** A code theme as the menu shows it: its name, and the two colors of its swatch. */
export interface ThemeOption {
  name: string;
  bg: string;
  accent: string;
}

interface ThemeListProps {
  /** The theme the page is in */
  theme: string;
  themes: ThemeOption[];
  /** A pick is under way: nothing else can be picked meanwhile */
  busy?: boolean;
  /** Another theme was picked (never the one the page is in) */
  onPick: (name: string) => void;
}

/** What the menu's button shows: the page's own theme, and a caret. Its button takes `theme-trigger`. */
export function ThemeTrigger() {
  return (
    <>
      <Swatch />
      <ChevronDown size={13} />
    </>
  );
}

/** The themes, each with its background, so light and dark show before picking. */
export function ThemeList({ theme, themes, busy, onPick }: ThemeListProps) {
  return (
    <MenuSection title='Code theme'>
      {themes.map((option) => (
        <MenuItem
          key={option.name}
          id={'theme-' + option.name}
          disabled={busy}
          icon={<Swatch bg={option.bg} accent={option.accent} />}
          onSelect={() => {
            if (option.name !== theme) onPick(option.name);
          }}
        >
          {option.name}
          {option.name === theme && <Check size={13} className='theme-check' />}
        </MenuItem>
      ))}
    </MenuSection>
  );
}

/** The code theme: a button that shows it, and the menu to pick another. The whole page follows the pick. */
export function ThemeMenu(props: ThemeListProps) {
  return (
    <Menu
      id='theme-btn'
      label={'Code theme: ' + props.theme}
      triggerClass='theme-trigger'
      className='theme-menu'
      trigger={<ThemeTrigger />}
    >
      <ThemeList {...props} />
    </Menu>
  );
}
