// How Electron Forge packs the desktop app: a folder you run it from (release/Lens-<platform>-<arch>),
// no installer. `npm run app:dist` builds app/dist and then runs this; `npx electron-forge package`
// after `npm run app:build` does the same.
//
// Unsigned: these are builds for your own machines.

import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import type { ForgeConfig } from "@electron-forge/shared-types";

/** The app itself is a few bundled files and two pages (scripts/app.ts builds them): no node_modules go in. */
const APP_FILES = /^(|\/package\.json|\/app|\/app\/dist|\/app\/dist\/[^/]+\.(mjs|cjs|js|css|html))$/;

const config: ForgeConfig = {
  outDir: "release",
  packagerConfig: {
    name: "Lens",
    appBundleId: "dev.lens.app",
    appCategoryType: "public.app-category.developer-tools",
    // icon.icns on macOS, icon.ico on Windows: `node scripts/app.ts icons` makes both from icon.png
    icon: "app/build/icon",
    asar: true,
    prune: false,
    ignore: (path) => !APP_FILES.test(path),
    // its copy of lens, as plain files beside the app: the CLI's sources, the packages it loads, the skills
    extraResource: ["app/dist/lens"],
  },
  makers: [],
  plugins: [
    // The fuses change the executable. On Apple silicon, which refuses to run one whose signature
    // doesn't match, the plugin signs it again ad hoc (no certificate) by itself.
    new FusesPlugin({
      version: FuseVersion.V1,
      // how the app runs the CLI: its own executable in Node mode. This one has to stay on.
      [FuseV1Options.RunAsNode]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      // cookie encryption stays off: on macOS it asks the Keychain for a key, which makes an app
      // without a certificate prompt for the login password. The one cookie is the theme's name.
      [FuseV1Options.EnableCookieEncryption]: false,
    }),
  ],
};

export default config;
