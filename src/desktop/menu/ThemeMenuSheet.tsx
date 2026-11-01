import { MenuPanel } from '../../ui/Menu.tsx';
import { ThemeList } from '../../ui/ThemeMenu.tsx';
import { useMenu } from './store.ts';

/** Places the menu where the strip's button is and opens it; the browser closes it on Esc or a click outside. */
function open(panel: HTMLDivElement | null, at: { right: number; top: number } | null) {
  if (!panel || !at) return;
  panel.style.top = at.top + 'px';
  panel.style.right = Math.max(8, window.innerWidth - at.right) + 'px';
  if (!panel.matches(':popover-open')) panel.showPopover?.();
}

/** The strip's theme menu: the viewer's (ui/ThemeMenu), whose button is in the strip's page. */
export function ThemeMenuSheet() {
  const menu = useMenu((store) => store.menu);
  if (!menu?.at) return null;
  const { at } = menu;
  return (
    <MenuPanel
      id='theme-menu'
      className='w-[240px]'
      // opened as it is put in the page: a ref callback, not an effect
      panelRef={(panel) => open(panel, at)}
      onToggle={(isOpen) => {
        if (!isOpen) window.lensApp.menu.close();
      }}
    >
      <ThemeList theme={menu.theme.name} themes={menu.themes} onPick={(name) => window.lensApp.menu.pick(name)} />
    </MenuPanel>
  );
}
