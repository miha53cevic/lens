// ⌘1–⌘9 (Ctrl elsewhere) pick a tab, and the modifier held on its own numbers the tabs in the strip.
// The keys go to the tab's page, never to the strip, so the window hands this every key bound for
// any of its views (`before-input-event`), before the page sees it. No Electron here.

/** The parts of Electron's `Input` this reads. */
export interface KeyInput {
  type: string;
  key: string;
  /** The physical key, `Digit1`: a layout that types something else on it still picks the tab */
  code: string;
  isAutoRepeat: boolean;
  shift: boolean;
  control: boolean;
  alt: boolean;
  meta: boolean;
}

export interface TabKeysHost {
  /** Show or hide the tabs' numbers */
  hints(on: boolean): void;
  /** The tab at this index (0-based), or the last one (⌘9, as in a browser) */
  select(index: number | 'last'): void;
  /** The modifier was let go, or the keys went elsewhere: whatever waited on that can stop */
  released(): void;
}

/** Runs `run` after `ms`; what it returns cancels it. */
export type Schedule = (run: () => void, ms: number) => () => void;

/** How long the modifier is held alone before the numbers show: a quick ⌘C or ⌘P doesn't flash them. */
export const HINT_DELAY_MS = 300;

const later: Schedule = (run, ms) => {
  const timer = setTimeout(run, ms);
  return () => clearTimeout(timer);
};

export class TabKeys {
  private readonly mac: boolean;
  private readonly host: TabKeysHost;
  private readonly schedule: Schedule;
  private cancel: (() => void) | null = null;
  private shown = false;

  constructor(platform: string, host: TabKeysHost, schedule: Schedule = later) {
    this.mac = platform === 'darwin';
    this.host = host;
    this.schedule = schedule;
  }

  /** One key bound for a page. True when it was a tab's key: the page doesn't get it. */
  input(input: KeyInput): boolean {
    if (input.type !== 'keyDown' && input.type !== 'keyUp') return false;
    const modifier = this.mac ? 'Meta' : 'Control';
    if (input.key === modifier) {
      if (input.type === 'keyUp') this.reset();
      else if (!input.isAutoRepeat && !this.cancel && !this.shown && this.alone(input)) {
        this.cancel = this.schedule(() => {
          this.cancel = null;
          this.shown = true;
          this.host.hints(true);
        }, HINT_DELAY_MS);
      }
      return false;
    }
    if (input.type === 'keyUp') return false;
    const digit = /^Digit([1-9])$/.exec(input.code);
    if (digit && this.alone(input)) {
      const number = Number(digit[1]);
      this.host.select(number === 9 ? 'last' : number - 1);
      return true;
    }
    // ⌘C, ⌘⇧…: a shortcut of the page's, not a look at the tabs
    this.reset();
    return false;
  }

  /** The numbers go: the modifier was let go, or the window lost the keys and won't hear it let go. */
  reset(): void {
    this.cancel?.();
    this.cancel = null;
    if (this.shown) {
      this.shown = false;
      this.host.hints(false);
    }
    this.host.released();
  }

  /** The platform's modifier is held, and nothing else is. */
  private alone(input: KeyInput): boolean {
    const [held, other] = this.mac ? [input.meta, input.control] : [input.control, input.meta];
    return held && !other && !input.shift && !input.alt;
  }
}
