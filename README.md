# @cresec/mcp-recorder

**A policy gate and signed log for your agent's MCP calls.** One command puts
a starter policy in front of every stdio MCP server your client runs: calls
that would delete, exfiltrate or spend are denied or held for your approval,
everything else runs, and every call, allowed or refused, lands in a
hash-chained, signed log you can verify offline and hand to someone else.

## Install

```sh
npm install -g @cresec/mcp-recorder
mcp-recorder protect --client claude-code
```

It must be a global install, not `npx`: the client config points at the
installed copy, and npx's cache can be deleted under it.

`--client` also takes `claude-desktop` and `cursor`. Afterwards, fully quit
and restart the client: MCP clients start their servers at launch, and Claude
Code reads its hooks when a session begins. Requires Node.js 22 or later.

## Six honest limits

1. **Nothing is enforced without `protect` or `--policy`.** Plain `record` only records: it forwards the exact bytes and blocks nothing.
2. **Claude Code's built-in Bash, Write and Edit tools are outside the gate.** The gate covers MCP tool calls, not the agent's own shell and file edits.
3. **`MCP_RECORDER_DISABLE=1` turns it off.** Recording and enforcement both stop, for anyone who controls the environment.
4. **Hosted connectors are gated only through the Claude Code hook.** On Claude Desktop and Cursor, connectors hosted by the vendor are not gated.
5. **Tamper-evident under a local key, not tamper-proof.** Someone with write access to the disk can delete the log; an edit inside a signed range makes `verify` fail.
6. **Recording fails open: a recording failure never blocks a call.** If the store breaks, calls keep flowing and the log can have gaps.

More detail on each, with what the recorder can see per surface:
[docs/reference.md](docs/reference.md#the-limits-in-detail) and
[docs/install.md](docs/install.md#connectors-what-the-recorder-can-and-cannot-see).

## Which configs it wraps

`protect` (and `setup`, which it drives) rewrites one client config, with a
timestamped backup and a sidecar so `--undo` restores it exactly:

| `--client` | Config file |
| --- | --- |
| `claude-desktop` | macOS `~/Library/Application Support/Claude/claude_desktop_config.json`; Windows `%APPDATA%\Claude\claude_desktop_config.json` (or the Microsoft Store install's copy); Linux `~/.config/Claude/claude_desktop_config.json` |
| `claude-code` | `.mcp.json` in the current directory if there is one, else `~/.claude.json`; plus the hook in `.claude/settings.json` in the current directory |
| `cursor` | `~/.cursor/mcp.json` |

`--config PATH` points it at any other file. Manual edits, Windows and WSL:
[docs/install.md](docs/install.md).

## How it works

The recorder is a stdio proxy between the client and each MCP server. With a
policy it is a gateway: each `tools/call` is allowed, denied with an error the
model can read, or held until you run `mcp-recorder approve <id>`.

- **Redaction at the edge.** String values are replaced by their SHA-256 and
  length before anything is written; tool arguments are always hashed.
- **Hash chain.** Each event is sealed as `sha256(prev_hash + "\n" + canonical event)`
  in a local SQLite or JSONL store, by default under `~/.mcp-recorder`.
- **Signed head.** The chain head is signed with a local ed25519 key;
  `mcp-recorder verify` re-walks every link and checks the signatures.
- **Export bundle.** `mcp-recorder export --out evidence.zip` writes the
  events, a manifest, the public key and `verify.cjs`.
- **`verify.cjs`.** A dependency-free verifier: anyone runs `node verify.cjs`
  inside the bundle, with no network, and pins your public key with
  `--public-key` if they got it from you out of band.

`mcp-recorder doctor` checks that enforcement is really in force;
`mcp-recorder why` explains what was stopped and how to change the rule.
Every command, the starter policy and the full security model:
[docs/reference.md](docs/reference.md).

## Uninstall

```sh
mcp-recorder setup --client claude-code --undo
mcp-recorder hook install --undo
npm uninstall -g @cresec/mcp-recorder
```

Use the same `--client` you passed to `protect`. `hook install --undo` edits
`.claude/settings.json` in the current directory, so run it where you ran
`protect` (or pass `--settings PATH`). Restart the client. Your data directory
is left in place; delete it yourself if you want the log gone.

## Where it was tested

CI runs typecheck, lint and the full test suite on Linux with Node 22 and 24,
and on Windows with Node 22 ([.github/workflows/ci.yml](.github/workflows/ci.yml)).

## Upgrading from a GitHub install made before 0.2.0

1. With the old install still present, run `mcp-recorder setup --client <C> --undo`
   for each client you wrapped, and `mcp-recorder hook install --undo`.
2. Find the old global package with `npm ls -g --depth=0` and remove it with
   `npm uninstall -g <that name>`.
3. Move the old data directory aside (default `~/.mcp-recorder`, or your
   `--data-dir` / `MCP_RECORDER_DATA_DIR`), for example
   `mv ~/.mcp-recorder ~/.mcp-recorder-pre-0.2.0`. Stores written before
   0.2.0 are not supported by 0.2.0; they verify with the version that wrote them.
4. `npm install -g @cresec/mcp-recorder`
5. `mcp-recorder protect --client <C>`

## Links

- [docs/install.md](docs/install.md): install, per-client setup, Windows and WSL, troubleshooting
- [docs/policy.md](docs/policy.md): the policy file, matching rules and the Rego output
- [docs/gateway.md](docs/gateway.md): gateway mode on a laptop and in CI
- [docs/event-schema.md](docs/event-schema.md): the event format and the chain
- [docs/public-evidence-sample.md](docs/public-evidence-sample.md): an example bundle, intact and tampered
- [docs/reference.md](docs/reference.md): every command, environment variable and the security model
- [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md): how to contribute (with the [CLA](CLA.md)) and how to report a vulnerability
- [cresec.ai/recorder](https://cresec.ai/recorder/?utm_source=github)
- [Early access](https://cresec.ai/early-access/?utm_source=github)

## License

GPL-3.0-or-later. Copyright (C) 2026 Cresec.ai LTD.

## Governed Tools for your team

The recorder is the open-source part of Cresec Governed Tools. To talk about governed internal tools for your team, request early access at https://cresec.ai/early-access/?utm_source=github. We’re taking early interest seriously and going through the list one by one. For bugs and questions about the recorder itself, open an issue on this repository.
