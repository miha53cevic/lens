// The UI's size, for the launcher's pages: the viewer's own choice, the cookie its UI size stepper
// keeps (src/cli-app/zoom.ts), read as the theme's is (themes.ts). The tab strip and the theme menu stay
// at 100%: the strip's height is the window's layout, and the native buttons drawn over it don't zoom.

import type { Session } from 'electron';
import { parsedZoom, UI_ZOOM_COOKIE, UI_ZOOM_DEFAULT } from '../../cli-app/zoom.ts';

/** Where the viewer's cookie lives: its host, whatever the port. */
const VIEWER_URL = 'http://127.0.0.1';

export class UiZoom {
  current = UI_ZOOM_DEFAULT;
  private readonly cookies: Session['cookies'];
  private readonly onChange: () => void;

  constructor(viewer: Session, onChange: () => void) {
    this.cookies = viewer.cookies;
    this.onChange = onChange;
  }

  private async saved(): Promise<number> {
    const [cookie] = await this.cookies.get({ url: VIEWER_URL, name: UI_ZOOM_COOKIE });
    return parsedZoom(cookie?.value);
  }

  async load(): Promise<void> {
    this.current = await this.saved();
  }

  /** Follows the viewer: a step in a review's Settings resizes the launcher's pages too. */
  watch(): void {
    this.cookies.on('changed', (_event, cookie) => {
      if (cookie.name !== UI_ZOOM_COOKIE || cookie.domain !== '127.0.0.1') return;
      // the default removes the cookie: read what is left rather than what changed
      void this.saved().then((zoom) => {
        if (zoom === this.current) return;
        this.current = zoom;
        this.onChange();
      });
    });
  }
}
