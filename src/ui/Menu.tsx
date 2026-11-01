// A menu that pops over the page. The browser's popover keeps its open state, closes it on
// Esc or a click outside, and puts it above everything, as <dialog> does for the dialogs.

import { useId, useRef, type ReactNode, type Ref } from 'react';
import clsx from 'clsx';
import { cn } from './cn.ts';
import { IconButton } from './IconButton.tsx';
import { Kbd } from './Kbd.tsx';
import { cssPx } from './zoom.ts';

// it grows from its button's corner, and goes quicker than it came
const MENU =
  'fixed inset-auto m-0 max-h-[calc(var(--screen-h)-80px)] w-[300px] origin-top-right overflow-y-auto rounded-lg border border-line-strong bg-raised p-2 text-md text-text opacity-0 shadow-2 [scale:0.96] [transition:opacity_var(--motion-exit),scale_var(--motion-exit),translate_var(--motion-exit),display_var(--motion-exit)_allow-discrete,overlay_var(--motion-exit)_allow-discrete] [translate:0_-4px] [&:popover-open]:opacity-100 [&:popover-open]:[scale:1] [&:popover-open]:[transition:opacity_var(--motion-enter),scale_var(--motion-enter),translate_var(--motion-enter),display_var(--motion-enter)_allow-discrete,overlay_var(--motion-enter)_allow-discrete] [&:popover-open]:[translate:0_0] starting:[&:popover-open]:opacity-0 starting:[&:popover-open]:[scale:0.96] starting:[&:popover-open]:[translate:0_-4px]';
const ITEM =
  'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left not-disabled:hover:bg-hover-bg focus-visible:bg-hover-bg focus-visible:-outline-offset-2 [&_kbd]:text-muted';
const DANGER =
  'text-danger not-disabled:hover:bg-[color-mix(in_oklab,var(--danger)_var(--tint),transparent)] focus-visible:bg-[color-mix(in_oklab,var(--danger)_var(--tint),transparent)]';

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
      data-part='menu'
      className={cn(MENU, className)}
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
      className={cn(ITEM, danger && DANGER)}
      disabled={disabled}
      onClick={(event) => {
        closeMenu(event.currentTarget);
        onSelect();
      }}
    >
      {icon}
      <span className='min-w-0 flex-1'>{children}</span>
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
      className={ITEM}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className='min-w-0 flex-1'>{children}</span>
      {shortcut && <Kbd combo={shortcut} />}
      {/* on / off */}
      <span
        className={clsx(
          "relative h-[15px] w-[26px] flex-none rounded-full motion-bg after:absolute after:top-[2px] after:size-[11px] after:rounded-full after:bg-surface after:[transition:left_var(--motion)] after:content-['']",
          checked ? 'bg-accent after:left-[13px]' : 'bg-line-strong after:left-[2px]',
        )}
        aria-hidden
      />
    </button>
  );
}

export function MenuSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role='group' aria-label={title}>
      <div className='eyebrow px-2 pt-2 pb-1'>{title}</div>
      {children}
    </div>
  );
}

export function MenuSeparator() {
  return <div className='my-1 h-px bg-line' role='separator' />;
}
