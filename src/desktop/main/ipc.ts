// A page's call, run: its arguments go through the call's parser (shared/ipc.ts) first, and its
// handler gets them typed. Who may make the call is window.ts's to check, before it gets here.

import type { Args, Calls, Parsers } from '../shared/ipc.ts';

/** What runs each call of an area, with the arguments its parser gave */
export type Handlers<Api> = {
  [Call in keyof Calls<Api>]: (...args: Args<Api, Call>) => void | Promise<void>;
};

/** Runs the call when its parser takes the arguments; false when it didn't (or there's no such call). */
export async function dispatch<Api>(
  parsers: Parsers<Api>,
  handlers: Handlers<Api>,
  call: string,
  args: unknown[],
): Promise<boolean> {
  if (!Object.hasOwn(parsers, call)) return false;
  const name = call as keyof Calls<Api>;
  const parsed = parsers[name](args);
  if (!parsed) return false;
  await (handlers[name] as (...args: unknown[]) => void | Promise<void>)(...(parsed as unknown[]));
  return true;
}
