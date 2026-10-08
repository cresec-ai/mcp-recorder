# Contributing

Thank you for helping with `@cresec/mcp-recorder`.

## Issues

Issues are welcome: bug reports, questions and feature requests. For a
suspected security vulnerability, do not open an issue; follow
[SECURITY.md](SECURITY.md) instead.

## Contributor License Agreement

Every contribution needs a signed Contributor License Agreement: Cresec.ai
LTD's [Individual Contributor License Agreement](CLA.md). You sign it once,
on your first pull request, through the CLA Assistant check, which posts a
link in the pull request. A pull request cannot be merged until the check
passes. You keep the copyright in your contribution.

## Development setup

You need Node.js 22 or later.

```sh
sh scripts/bootstrap.sh   # once: installs dependencies and rebuilds dist/
npm run typecheck
npm run lint
npm test
```

All three must pass before you open a pull request. `npm run lint:fix`
applies the auto-fixable lint rules.

## `dist/` is committed

The compiled `dist/` is committed to the repository. After changing anything
under `src/`, rebuild it with:

```sh
npm run compile
```

and commit the `dist/` changes in the same commit. CI fails when `dist/` is
stale. Do not add a `build`, `prepare`, `prepack` or `install` script to
`package.json`; the reason is in [AGENTS.md](AGENTS.md).

More rules that every change must keep (fail-open recording, no readable
payloads in the store, the frozen event schema) are in
[AGENTS.md](AGENTS.md).
