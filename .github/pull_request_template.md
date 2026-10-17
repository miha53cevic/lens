<!--
The title becomes the squash commit, and release-please reads it to pick the next version:
  fix: …        a patch release
  feat: …       a minor release
  feat!: …      a major release (or a "BREAKING CHANGE:" line below)
  chore: / refactor: / docs: / test: …   no release
-->

## What

## Why

## Checks

- [ ] `bun run test` passes
- [ ] README updated, if a command, flag, major feature, fold category or config field changed
- [ ] `bun run app:smoke` run and its pictures read, if the desktop app's glue or packing changed
