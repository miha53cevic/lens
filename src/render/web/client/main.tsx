// lens viewer: the page's entry point, bundled by esbuild when the server starts (see bundle.ts).

import { createRoot } from "react-dom/client";
import { App } from "./components/App.tsx";
import { getState } from "./store.ts";
import { openFirstTreeFile, setView } from "./actions.ts";
import { askPoll } from "./ask.ts";

openFirstTreeFile();
if (getState().ask.open) askPoll();
createRoot(document.getElementById("root")!).render(<App />);
if (location.hash === "#summary" && getState().data.summary) setView("summary");
