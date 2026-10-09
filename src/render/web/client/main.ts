// lens viewer: the page's entry point, bundled by esbuild when the server starts (see bundle.ts).

import { DATA, state } from "./shared.ts";
import { initCode, openFirstTreeFile, render } from "./code.ts";
import { setView, syncViewSwitch } from "./summary.ts";
import { initAsk } from "./ask.ts";
import "./keys.ts";

initCode();
initAsk();
openFirstTreeFile();
syncViewSwitch();
render();
if (location.hash === "#summary" && DATA.summary && state.view !== "summary") setView("summary");
