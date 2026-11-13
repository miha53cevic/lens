import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { loadConfig } from '../config.ts';
import { loadDiff, collectUnits, commitLog } from './collect.ts';
import { prepareBundle, prepareCommand } from './bundle.ts';
import { hasUnits, validateResult } from './validate.ts';
import {
  checkoutFirst,
  HOUSEKEEPING,
  reviewKey,
  readStored,
  writeStored,
  unitSetHash,
  wholeDiffLeft,
  type Bundle,
} from './store.ts';
import { relPath } from '../paths.ts';
import { buildPreviewsOn, selfChecksOn } from './settings.ts';
import { writeAssets } from './previews.ts';
import { recordSubmit } from './progress.ts';

/** `lens summary prepare|submit` — the agent's side of summary mode. */
export async function runSummary(rest: string[], cwd: string): Promise<void> {
  const [sub, ...args] = rest;
  if (sub === 'prepare') {
    let command: 'diff' | 'pr' = 'diff';
    if (args[0] === 'pr') {
      command = 'pr';
      args.shift();
    } else if (args[0] === 'diff') args.shift();
    if (command === 'pr' && args.length !== 1)
      throw new Error('summary prepare pr takes one argument — a PR URL or number');
    const checkout = checkoutFirst(cwd, command, args);
    if (checkout?.worktree) {
      throw new Error(
        `this diff ends at ${checkout.branch}, which is checked out in ${checkout.worktree.root}: ` +
          `a summary is written from the code on disk there. Prepare it in that worktree`,
      );
    }
    if (checkout) {
      throw new Error(
        `this diff ends at ${checkout.branch}, which isn't checked out: a summary is written from the code on disk. ` +
          `Run \`git checkout ${checkout.branch}\`, then prepare again`,
      );
    }
    const config = loadConfig(cwd);
    const diff = await loadDiff(command, args, cwd, config);
    const units = await collectUnits(diff, config, cwd);
    if (units.length === 0) {
      console.log('lens: nothing to summarize — this diff has no changed text files');
      return;
    }
    const key = reviewKey(diff.root, command, args);
    const result = prepareBundle({
      root: diff.root,
      cwd,
      key,
      command,
      args,
      label: diff.label,
      commits: commitLog(diff.diffArgs, cwd),
      units,
      sources: new Map([...diff.sources].map(([abs, src]) => [relPath(diff.root, abs), src])),
      drawings: buildPreviewsOn(diff.root, config),
      checks: selfChecksOn(diff.root, config),
    });
    console.log(result.instructions);
    return;
  }
  if (sub === 'submit') {
    const target = args[0];
    if (!target) throw new Error('summary submit needs the bundle folder (or its result.json)');
    const abs = resolve(cwd, target);
    // By what's on disk, not the name: a key can end in ".json" (`prepare -- package.json`).
    const isDir = existsSync(abs) && statSync(abs).isDirectory();
    const dir = isDir ? abs : dirname(abs);
    const resultFile = isDir ? join(dir, 'result.json') : abs;
    const bundlePath = join(dir, 'bundle.json');
    if (!existsSync(bundlePath))
      throw new Error(`no bundle.json in ${relPath(cwd, dir)} — run \`lens summary prepare\` first`);
    if (!existsSync(resultFile)) throw new Error(`no ${relPath(cwd, resultFile)} — write the result there first`);
    const bundle = JSON.parse(readFileSync(bundlePath, 'utf8')) as Bundle;
    let result: unknown;
    try {
      result = JSON.parse(readFileSync(resultFile, 'utf8'));
    } catch (err) {
      throw new Error(`${relPath(cwd, resultFile)} is not valid JSON: ${(err as Error).message}`);
    }
    // <root>/.lens/summary/<key>
    const root = resolve(dir, '..', '..', '..');
    const outcome = validateResult(bundle, result, root, readStored(root, bundle.key));
    writeStored(root, bundle.key, outcome.stored);
    writeAssets(root, bundle.key, outcome.stored, outcome.assets);
    const missing = bundle.units.filter(
      (u) => !outcome.stored.units[u.id] || outcome.stored.units[u.id].hash !== u.hash,
    );
    console.log(
      `lens: accepted ${outcome.accepted.length} unit${outcome.accepted.length === 1 ? '' : 's'}` +
        (outcome.acceptedFlows ? `, ${outcome.acceptedFlows} flow${outcome.acceptedFlows === 1 ? '' : 's'}` : '') +
        (outcome.acceptedOverview ? ', the overview' : '') +
        (outcome.acceptedPreviews
          ? `, ${outcome.acceptedPreviews} preview${outcome.acceptedPreviews === 1 ? '' : 's'}`
          : '') +
        (outcome.acceptedSequences
          ? `, ${outcome.acceptedSequences} sequence${outcome.acceptedSequences === 1 ? '' : 's'}`
          : '') +
        (outcome.acceptedChecks
          ? `, ${outcome.acceptedChecks} self-check${outcome.acceptedChecks === 1 ? '' : 's'}`
          : ''),
    );
    if (outcome.dropped.length > 0) {
      console.log(
        `\nrejected ${outcome.dropped.length} — fix these entries in ${basename(resultFile)} and submit again:`,
      );
      for (const d of outcome.dropped) console.log(`  - ${d}`);
    }
    if (missing.length > 0) {
      console.log(`\n${missing.length} unit${missing.length === 1 ? ' has' : 's have'} no summary yet:`);
      for (const u of missing.slice(0, 20)) console.log(`  - ${u.id}`);
      if (missing.length > 20) console.log(`  - … and ${missing.length - 20} more`);
    }
    const { coverage } = outcome;
    // coverage only once there are flows to cover with: before the final pass it's all zeros
    if (missing.length === 0 && outcome.stored.flows.length > 0) {
      console.log(`\nflows cover ${coverage.inFlows} of ${coverage.summarized} units`);
      const outside = coverage.outside;
      if (outside.length > 0) {
        console.log(
          `${outside.length} unit${outside.length === 1 ? ' is' : 's are'} in no flow — add each to the story it serves (or to "${HOUSEKEEPING}"):`,
        );
        const flagged = (id: string) => (outcome.stored.units[id].needsLook ? ' (has a concern or break)' : '');
        for (const id of outside.slice(0, 20)) console.log(`  - ${id}${flagged(id)}`);
        if (outside.length > 20) console.log(`  - … and ${outside.length - 20} more`);
      }
      if (coverage.advice.length > 0) {
        console.log(`\nthe flows look split up — worth a look:`);
        for (const line of coverage.advice) console.log(`  - ${line}`);
      }
    }
    if (outcome.previewAdvice.length > 0) {
      console.log(`\nthe previews look like one screen drawn in pieces — worth a look:`);
      for (const line of outcome.previewAdvice) console.log(`  - ${line}`);
    }
    const undrawn = !!bundle.drawings && outcome.stored.drawn !== unitSetHash(bundle.units);
    if (missing.length === 0 && wholeDiffLeft(bundle, outcome.stored)) {
      const what = undrawn ? 'flows, the overview and the drawings' : 'the whole-diff work';
      console.log(`\nevery unit is summarized — run \`${prepareCommand(bundle)}\` for the final pass (${what})`);
    }
    // what was printed above as "fix these" (not the advice, which is only worth a look): the viewer
    // keeps showing the run until a submit asks for nothing more
    const unflowed = missing.length === 0 && outcome.stored.flows.length > 0 && coverage.outside.length > 0;
    recordSubmit(dir, bundle, outcome.dropped.length > 0 || unflowed);
    console.log(`\nsummary saved — refresh the lens viewer (↻) and open the Summary tab`);
    const submitted = hasUnits(result) ? Object.keys(result.units).length : 0;
    const acceptedAny =
      outcome.accepted.length > 0 ||
      outcome.acceptedOverview ||
      outcome.acceptedPreviews > 0 ||
      outcome.acceptedSequences > 0 ||
      outcome.acceptedChecks > 0;
    if (!acceptedAny && (submitted > 0 || outcome.dropped.length > 0)) process.exitCode = 1;
    return;
  }
  throw new Error(`unknown summary subcommand "${sub ?? ''}" — use prepare or submit`);
}
