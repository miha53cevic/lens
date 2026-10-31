// A menu that pops over the page. The browser's popover keeps its open state, closes it on
// Esc or a click outside, and puts it above everything, as <dialog> does for the dialogs.

import { useId, useRef, type ReactNode, type Ref } from 'react';
import clsx from 'clsx';
import { IconButton } from './IconButton.tsx';
import { Kbd } from './Kbd.tsx';
import { cssPx } from './zoom.ts';
import './Menu.css';

interface MenuProps {
  /** The trigger's id */
  id?: string;
  /** The trigger's tooltip and accessible name */
  label: string;
  /** What the trigger shows */
  trigger: ReactNode;
  triggerClass?: string;
  className?: string;
  children: ReactNode;
}

export function Menu({ id, label, trigger, triggerClass, className, children }: MenuProps) {
  const popoverId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  return (
    <>
      <IconButton
        id={id}
        label={label}
        className={triggerClass}
        popoverTarget={popoverId}
        onClick={(event) => placeUnder(menuRef.current, event.currentTarget)}
      >
        {trigger}
      </IconButton>
      <MenuPanel panelRef={menuRef} id={popoverId} className={className}>
        {children}
      </MenuPanel>
    </>
  );
}

interface MenuPanelProps {
  id?: string;
  className?: string;
  panelRef?: Ref<HTMLDivElement>;
  /** It opened or closed, by whatever means (a pick, Esc, a click outside) */
  onToggle?: (open: boolean) => void;
  children: ReactNode;
}

/**
 * The menu itself, without a button: `Menu` opens it under its own, and a page whose button is
 * somewhere else opens it with `showPopover()` and places it.
 */
export function MenuPanel({ id, className, panelRef, onToggle, children }: MenuPanelProps) {
  return (
    <div
      ref={panelRef}
      id={id}
      popover='auto'
      role='menu'
      className={clsx('menu', className)}
      onToggle={onToggle && ((event) => onToggle(event.newState === 'open'))}
    >
      {children}
    </div>
  );
}

/** The menu opens under its trigger, right-aligned with it. */
function placeUnder(menu: HTMLElement | null, trigger: HTMLElement) {
  if (!menu) return;
  const rect = trigger.getBoundingClientRect();
  menu.style.top = cssPx(rect.bottom) + 6 + 'px';
  menu.style.right = Math.max(8, cssPx(window.innerWidth - rect.right)) + 'px';
}

/** An open menu at a point (a right-click): its top left corner there, kept inside the window. */
export function placeAt(menu: HTMLElement, x: number, y: number) {
  const { width, height } = menu.getBoundingClientRect();
  menu.style.right = 'auto';
  // in CSS px, as the menu's own 8px margin is
  const [left, top, right, bottom] = [x, y, window.innerWidth - width, window.innerHeight - height].map(cssPx);
  menu.style.left = Math.max(8, Math.min(left, right - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(top, bottom - 8)) + 'px';
}

/** Closes the menu an item is in. */
function closeMenu(item: HTMLElement) {
  item.closest<HTMLElement>('[popover]')?.hidePopover?.();
}

interface MenuItemProps {
  id?: string;
  icon?: ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
  children: ReactNode;
}

/** An action: the menu closes once it runs. */
export function MenuItem({ id, icon, shortcut, danger, disabled, onSelect, children }: MenuItemProps) {
  return (
    <button
      id={id}
      role='menuitem'
      className={clsx('menu-item', danger && 'danger')}
      disabled={disabled}
      onClick={(event) => {
        closeMenu(event.currentTarget);
        onSelect();
      }}
    >
      {icon}
      <span className='menu-label'>{children}</span>
      {shortcut && <Kbd combo={shortcut} />}
    </button>
  );
}

interface MenuSwitchProps {
  id?: string;
  shortcut?: string;
  title?: string;
  /** Can't be changed now: another setting decides it */
  disabled?: boolean;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}

/** A setting turned on or off: the menu stays open, so several can change in a row. */
export function MenuSwitch({ id, shortcut, title, disabled, checked, onChange, children }: MenuSwitchProps) {
  return (
    <button
      id={id}
      role='menuitemcheckbox'
      aria-checked={checked}
      className='menu-item'
      title={title}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className='menu-label'>{children}</span>
      {shortcut && <Kbd combo={shortcut} />}
      <span className={clsx('switch', checked && 'on')} aria-hidden />
    </button>
  );
}

export function MenuSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className='menu-section' role='group' aria-label={title}>
      <div className='menu-title eyebrow'>{title}</div>
      {children}
    </div>
  );
}

export function MenuSeparator() {
  return <div className='menu-sep' role='separator' />;
}
