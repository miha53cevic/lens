import { readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, relative, dirname, basename } from "node:path";
import { loadConfig } from "../config.ts";
import { loadDiff, collectUnits, commitLog, readNewSource } from "./collect.ts";
import { prepareBundle } from "./bundle.ts";
import { validateResult } from "./validate.ts";
import { summaryKey, readStored, writeStored, type Bundle } from "./store.ts";

/** `lens summary prepare|submit` — the agent's side of summary mode. */
export async function runSummary(rest: string[], cwd: string): Promise<void> {
  const [sub, ...args] = rest;
  if (sub === "prepare") {
    let command: "diff" | "pr" = "diff";
    if (args[0] === "pr") { command = "pr"; args.shift(); }
    else if (args[0] === "diff") args.shift();
    if (command === "pr" && args.length !== 1) throw new Error("summary prepare pr takes one argument — a PR URL or number");
    const config = loadConfig(cwd);
    const diff = await loadDiff(command, args, cwd, config);
    const sourcesByPath = new Map(diff.targets.map((t) => [t.file, readNewSource(t, cwd)]));
    const units = await collectUnits(diff, config, cwd, sourcesByPath);
    if (units.length === 0) {
      console.log("lens: nothing to summarize — this diff has no changed text files");
      return;
    }
    const result = prepareBundle({
      root: diff.root,
      cwd,
      key: summaryKey(command, args),
      command,
      args,
      label: diff.label,
      commits: commitLog(diff.diffArgs, cwd),
      units,
      sources: new Map([...sourcesByPath].map(([abs, src]) => [relative(diff.root, abs), src])),
    });
    console.log(result.instructions);
    return;
  }
  if (sub === "submit") {
    const target = args[0];
    if (!target) throw new Error("summary submit needs the bundle folder (or its result.json)");
    const abs = resolve(cwd, target);
    // By what's on disk, not the name: a key can end in ".json" (`prepare -- package.json`).
    const isDir = existsSync(abs) && statSync(abs).isDirectory();
    const dir = isDir ? abs : dirname(abs);
    const resultFile = isDir ? join(dir, "result.json") : abs;
    const bundlePath = join(dir, "bundle.json");
    if (!existsSync(bundlePath)) throw new Error(`no bundle.json in ${relative(cwd, dir) || dir} — run \`lens summary prepare\` first`);
    if (!existsSync(resultFile)) throw new Error(`no ${relative(cwd, resultFile)} — write the result there first`);
    const bundle = JSON.parse(readFileSync(bundlePath, "utf8")) as Bundle;
    let result: unknown;
    try {
      result = JSON.parse(readFileSync(resultFile, "utf8"));
    } catch (err) {
      throw new Error(`${relative(cwd, resultFile)} is not valid JSON: ${(err as Error).message}`);
    }
    // <root>/.lens/summary/<key>
    const root = resolve(dir, "..", "..", "..");
    const outcome = validateResult(bundle, result, root, readStored(root, bundle.key));
    writeStored(root, bundle.key, outcome.stored);
    const missing = bundle.units.filter((u) => !outcome.stored.units[u.id] || outcome.stored.units[u.id].hash !== u.hash);
    console.log(`lens: accepted ${outcome.accepted.length} unit${outcome.accepted.length === 1 ? "" : "s"}` +
      (outcome.acceptedFlows ? `, ${outcome.acceptedFlows} flow${outcome.acceptedFlows === 1 ? "" : "s"}` : "") +
      (outcome.acceptedOverview ? ", the overview" : ""));
    if (outcome.dropped.length > 0) {
      console.log(`\nrejected ${outcome.dropped.length} — fix these entries in ${basename(resultFile)} and submit again:`);
      for (const d of outcome.dropped) console.log(`  - ${d}`);
    }
    if (missing.length > 0) {
      console.log(`\n${missing.length} unit${missing.length === 1 ? " has" : "s have"} no summary yet:`);
      for (const u of missing.slice(0, 20)) console.log(`  - ${u.id}`);
      if (missing.length > 20) console.log(`  - … and ${missing.length - 20} more`);
    }
    console.log(`\nsummary saved — refresh the lens viewer (↻) and open the Summary tab`);
    const submitted = typeof result === "object" && result !== null && typeof (result as { units?: unknown }).units === "object"
      ? Object.keys((result as { units: object }).units).length : 0;
    if (outcome.accepted.length === 0 && !outcome.acceptedOverview && (submitted > 0 || outcome.dropped.length > 0)) process.exitCode = 1;
    return;
  }
  throw new Error(`unknown summary subcommand "${sub ?? ""}" — use prepare or submit`);
}
