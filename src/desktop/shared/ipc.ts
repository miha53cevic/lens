// What each call of the app's pages may carry: one parser per call, which takes the arguments as
// they arrive over IPC (anything) and gives them back typed, or null to drop the call. The preload
// forwards these names and nothing else; the main process (main/ipc.ts) runs a call only once its
// parser took it. What a call may name beyond its type (a folder the app listed, a known branch or
// theme) needs the main process's state, so window.ts checks that in the call's handler.

import type { LauncherApi, MenuApi, SetupPart, StripApi } from './api.ts';
import { parseChoice } from './choice.ts';

/** The calls of an area: its api without the state it reads */
export type Calls<Api> = Omit<Api, 'state' | 'onState'>;

export type Args<Api, Call extends keyof Calls<Api>> = Calls<Api>[Call] extends (...args: infer A) => unknown
  ? A
  : never;

/** A parser per call: the call's own arguments, or null */
export type Parsers<Api> = {
  [Call in keyof Calls<Api>]: (args: unknown[]) => Args<Api, Call> | null;
};

const isId = (value: unknown): value is number => Number.isInteger(value);
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const isHexColor = (value: unknown): value is string => isString(value) && /^#[0-9a-f]{6}$/i.test(value);
const isPart = (value: unknown): value is SetupPart => value === 'cli' || value === 'skills';

const none = (): [] => [];
const id = ([value]: unknown[]): [number] | null => (isId(value) ? [value] : null);
const text = ([value]: unknown[]): [string] | null => (isString(value) ? [value] : null);
const part = ([value]: unknown[]): [SetupPart] | null => (isPart(value) ? [value] : null);

export const STRIP_ARGS: Parsers<StripApi> = {
  select: id,
  close: id,
  add: none,
  change: id,
  themeMenu: ([right, bottom]) => (isNumber(right) && isNumber(bottom) ? [right, bottom] : null),
  settings: none,
  chrome: ([color, symbolColor]) => (isHexColor(color) && isHexColor(symbolColor) ? [color, symbolColor] : null),
};

export const LAUNCHER_ARGS: Parsers<LauncherApi> = {
  openRepository: none,
  openRecent: text,
  forgetRecent: text,
  setBase: text,
  refresh: none,
  open: ([value]) => {
    const choice = parseChoice(value);
    return choice ? [choice] : null;
  },
  cancel: none,
  dismiss: none,
  back: none,
  showRunning: none,
  recheck: none,
  settings: none,
  sandbox: none,
  install: part,
  uninstall: part,
};

export const MENU_ARGS: Parsers<MenuApi> = {
  pick: text,
  close: none,
};

const names = <Api>(parsers: Parsers<Api>) => Object.keys(parsers) as (keyof Calls<Api> & string)[];

/** The calls a page may make: the preload forwards these names and nothing else. */
export const STRIP_CALLS = names(STRIP_ARGS);
export const LAUNCHER_CALLS = names(LAUNCHER_ARGS);
export const MENU_CALLS = names(MENU_ARGS);
