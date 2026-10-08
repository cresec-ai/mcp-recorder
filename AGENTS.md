# Working in this repository

`@cresec/mcp-recorder` is a policy gate and signed log for an agent's MCP
calls: a fail-open MCP recording proxy that wraps a stdio or streamable-HTTP MCP
server and records every tool call, redacted at the edge, into a tamper-evident
local evidence store, and, with a policy file, an enforcing gateway over those
calls. Read `README.md` for what it promises, `docs/reference.md` for the
detail and `docs/event-schema.md` for the frozen event format. Contributions
need a signed CLA; see `CONTRIBUTING.md`.

## Setup

Run `sh scripts/bootstrap.sh` once in a fresh checkout. It installs
dependencies, is idempotent, and is safe to run while other processes run it
(it takes a lock). Point any agent platform's setup hook at the same script.

## Commands

- `npm run typecheck` — TypeScript, strict, over `src` AND `test`/`bench`/
  `demo`. Two configs, because `tsconfig.json` emits the committed `dist/`
  and must not compile the tests: `tsconfig.test.json` extends it with
  `noEmit` and the wider `include`. Add a new top-level TypeScript directory
  to that `include` or nothing will check it — vitest and tsx strip types
  rather than check them, so an unchecked test can call a one-argument
  function with two and stay green forever.
- `npm test` — vitest; spawns real child processes, takes about a minute.
- `npm run demo` — scripted prompt-injection incident, recorded and verified.
- `npm run bench` — latency gate (p50 added latency must stay under 5 ms).
- `npm run bench:gateway` — the same round-trip measured with a policy in
  force, so gateway-mode added latency is comparable to record mode. The
  policy it loads is the SHIPPED STARTER POLICY (`src/policy/starter.ts`), the
  one `mcp-recorder protect` installs, because that is the number the product
  owes rather than a number about a fixture — and it is the expensive shape:
  four of its seven rules carry `match.any_arg`, which collects every string
  leaf of the arguments and matches a regex against all of them. Opt-in; it
  does not change `npm run bench` or its gate.
- `npm run bench:boundary` — what the tool-result boundary filter costs
  synchronously on the forwarding path, by result size and content. Its ReDoS
  alarm is a ratio between cells of the same run (a scan that goes
  superlinear in input size), not a wall-clock threshold, so it holds on a
  loaded runner. Run by `npm test` and by CI.

## Enforcement is the front door

The first thing a newcomer meets is `mcp-recorder protect --client <C>`:
enforcement selected in one command, with nothing to author. It materialises
the starter policy (`src/policy/starter.ts`) into the data directory, drives
the existing `setup --policy` and `hook install --policy` paths, and ends by
running `doctor` so the last line on screen is a measurement rather than a
claim. `docs/first-run.md` is the design; `README.md` and `docs/install.md`
lead with it.

This does NOT weaken the gateway-mode rule below. `protect` is a separate
subcommand that WRITES files; `--protect` on `record`/`http` resolves to
`<data-dir>/policy.starter.yaml` and never writes it (a missing starter file
is exit 2 before the server is spawned, naming `protect`); and a starter
policy sitting in the data directory is NOT an input to `resolvePolicyPath`.
A bare `record` still takes the two-raw-`.pipe()` branch with no Transform,
and `test/protect-doctor.test.ts` pins that with a byte-for-byte differential.
Anything that makes a bare `record` start denying is a violation, not a
feature.

`mcp-recorder doctor` exists to detect an ABSENCE: the shape where
a policy loads, validates and matches nothing while the chain looks healthy.
Every check is tri-state (OK / FAIL / INCOMPLETE) and a check that could not
be performed is never folded into OK; exit 3 means "nothing failed and
something was unchecked". Anything that resolves a connector or a tool name is
tested against BOTH orderings, key-matches-segment and key-does-not
(`src/doctor/spellings.ts`).

`mcp-recorder why` is the person's side of the refusal boundary. The text the
model receives on a deny is unchanged (`src/gateway/boundary.ts`) and
deliberately does not say how to relax a rule; `why` does, and it prints no
argument or result text — every string it shows comes from the policy file,
the tool name and the rule id.

## Rules that must hold

- `dist/` is committed, and package.json deliberately has NO `build`,
  `prepare`, `prepack` or `install` script — the compile step is `npm run
  compile`. npm runs a nested `npm install` inside a git clone whenever any of
  those script names exist, and on a global install from a git URL that nested install runs in global mode and
  fails; with none of them present, npm packs the clone as-is and the
  committed `dist/` is what ships. After changing anything under `src/`, run
  `npm run compile` and commit the `dist/` changes with it — CI fails on a
  stale `dist/`. `tsconfig.json` pins `newLine: lf` so the output is identical
  on every platform.

- The event schema `cresec.mcp-recorder.event.v1` is frozen: additive optional
  fields only, documented in `docs/event-schema.md`. The identifiers changed
  once, in 0.2.0; records written before 0.2.0 verify with the version that
  wrote them, and there is no migration.
- Fail-open: nothing about recording may block, delay, corrupt or kill the
  traffic being forwarded. Synchronous waits on the proxy thread stay short.
- No readable payload strings ever reach the store, the replay page, or a
  bundle; tool arguments are hashed unconditionally.
- Never skip or weaken a test to get green.
- The evidence sink (`MCP_RECORDER_SINK`, `mcp-recorder ship`, `src/sink/`)
  is a read-only REPLICA and never runs on the forwarding path. It ships in
  its own detached process, one per data dir; `record`/`http`/`hook` do one
  `statSync` and at most a spawn-and-forget between them. It never calls
  `record()`, never appends to the chain, and has no second queue — the spool
  IS the chain, read with `store.iterate`. A sink that is down, slow, 500ing,
  401ing or hostile must never block a tool call, deny one, change a byte of
  stdout, change an exit code, or cost a local event. It cannot widen
  redaction either: records go on the wire verbatim, so a rewritten `event`
  stops reproducing `record.hash`. Never couple it to gateway enforcement —
  that is fail-CLOSED and decided entirely in-process. See docs/sink.md.

- Gateway mode — `record --policy` (or `--protect`, which resolves to
  `<data-dir>/policy.starter.yaml` and nothing else) over stdio, and
  `http --policy` / `http --protect` over the streamable-HTTP transport
  — is the ONLY place the proxy may block, delay or rewrite traffic, and only
  for `tools/call` requests and their results. `src/proxy/http.ts` states the
  same rule for the HTTP leg ("GATEWAY MODE (`opts.gateway` present, i.e.
  `http --policy`) is the ONE place the above is set aside"); its tests are
  `test/http-gateway.test.ts` and `test/http-gateway-failclosed.test.ts`.
  Without one of those flags the byte-for-byte, fail-open behaviour above is
  untouched, on both transports — the existence of a policy FILE never
  switches enforcement on, only a flag or `MCP_RECORDER_POLICY` does. Inside gateway mode, recording stays fail-open (a store failure
  never becomes a deny) while enforcement fails closed (an unevaluable policy
  or an unwritable hold is a deny). Hold files under `<data-dir>/holds/` and
  `policy_decision` events carry hashed arguments only — the no-readable-
  payloads rule applies to them exactly as to the store. `policy.yaml` v1 is
  documented in `docs/policy.md` and its JSON Schema in
  `docs/policy-schema.json`; the TypeScript engine and the emitted Rego must
  stay semantically identical (the OPA parity test enforces it, and
  `test/protect-doctor.test.ts` runs the same gate over the shipped starter
  policy). `match.args` and `match.any_arg` both fail CLOSED past their
  budgets: an over-long value, a timed-out regex, and arguments past the
  256-leaf / 256-KiB `any_arg` scan budget are all denies, never truncated
  scans — truncating turns a deny into an allow. That `any_arg` budget is
  SETTABLE (`mcp.any_arg: { max_leaves, max_bytes }`) because the cliff is
  reachable by ordinary work; raising it scans more, never less. A fail-closed
  deny carries a stable `errorCode` that reaches three places which must keep
  agreeing: the guidance clause the model reads, the `rule <label>` on stderr,
  and `policy_decision.error_code` in the chain. `mcp-recorder why` explains
  those refusals, and never attributes a reason or an "edit this file" remedy
  to a policy file whose bytes do not hash to the decision's `policy_hash`.

- CI also runs a leak guard over the whole tree: no pre-0.2.0 package name,
  no private links, no internal run names. Keep it empty; do not loosen it.
