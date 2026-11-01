import { Check, ChevronDown } from 'lucide-react';
import { Menu, MenuItem, MenuSection } from './Menu.tsx';
import { Swatch } from './Swatch.tsx';

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

/** The menu's button: a swatch (ui/Swatch) and a caret, wider than an icon. */
export const THEME_TRIGGER = 'inline-flex w-auto gap-1 px-2';

/** What the menu's button shows: the page's own theme, and a caret. Its button takes `THEME_TRIGGER`. */
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
          {option.name === theme && (
            <Check size={13} data-part='theme-check' className='ml-2 align-[-2px] text-accent' />
          )}
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
      triggerClass={THEME_TRIGGER}
      data-part='theme-menu'
      className='w-[240px]'
      trigger={<ThemeTrigger />}
    >
      <ThemeList {...props} />
    </Menu>
  );
}
