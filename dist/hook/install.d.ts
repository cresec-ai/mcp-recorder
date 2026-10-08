/**
 * `mcp-recorder hook install` — merge the `hook` subcommand into a Claude
 * Code settings file's `hooks` block: PreToolUse/PostToolUse/
 * PostToolUseFailure matched on `mcp__.*` (or `.*` with --all-tools), plus
 * SessionEnd (a session_end event) and Stop (a 'claude-code/stop'
 * turn-boundary notification) with no matcher — see docs/hooks.md and
 * https://code.claude.com/docs/en/hooks. PostToolUseFailure gets exactly the
 * same matcher and command as PostToolUse: Claude Code fires one OR the
 * other per tool call (success vs failure), so without it every failed call
 * would be recorded as a lone `pre` event. SessionStart is
 * left alone: it is for environment setup, not evidence.
 *
 * Pure functions over parsed JSON, mirroring src/setup/wrap.ts: cli.ts owns
 * every filesystem side effect and exit code, this module just decides what
 * the new `hooks` object should look like. A hook command is recognised as
 * ours by its argv SHAPE (`<node> <…/dist/cli.js> hook …`, or the npx /
 * global-binary forms — src/setup/shape.ts), never by the exact node or
 * cli.js path, because both move (an nvm switch, an upgrade). Install is
 * idempotent for the exact current command and REPLACES a stale managed
 * command (same shape, other paths or arguments) rather than adding a
 * second hook beside it; `planHookUndo` removes every managed command,
 * whichever Node or install wrote it. A hook that is not ours — and
 * everything else in the settings file — is never touched.
 */
declare const MANAGED_EVENTS: readonly ["PreToolUse", "PostToolUse", "PostToolUseFailure", "SessionEnd", "Stop"];
export type ManagedEvent = (typeof MANAGED_EVENTS)[number];
export interface HookCommandEntry {
    type: 'command';
    command: string;
}
export interface HookMatcherEntry {
    matcher?: string;
    hooks: HookCommandEntry[];
}
export interface BuildHookCommandOpts {
    /** Absolute path to node (process.execPath). */
    execPath: string;
    /** Absolute path to this install's dist/cli.js. */
    cliPath: string;
    /** Absolute --data-dir. */
    dataDir: string;
    policyPath?: string;
    clientName?: string;
    allTools: boolean;
}
/** Build the settings.json hook `command` string for this install. Mirrors
 *  src/setup/wrap.ts's `buildWrappedEntry` for `--wrapper local`: absolute
 *  node + absolute dist/cli.js, so the hook works regardless of the shell's
 *  cwd or PATH. */
export declare function buildHookCommand(opts: BuildHookCommandOpts): string;
export interface HookInstallOpts {
    /** The exact shell command line this install writes/looks for. */
    command: string;
    /** Matcher for PreToolUse/PostToolUse/PostToolUseFailure: 'mcp__.*' by default, '.*' with --all-tools. */
    matcher: string;
}
export interface HookInstallPlan {
    root: Record<string, unknown>;
    /** Event types a new entry was added to this run. */
    added: ManagedEvent[];
    /** Event types that already had this exact command installed. */
    alreadyInstalled: ManagedEvent[];
    /** Event types from which a STALE managed command (recognised by shape,
     *  but not this exact command — another node or cli.js path, or other
     *  arguments) was removed this run, so the current one is the only hook
     *  of ours left there. */
    replaced: ManagedEvent[];
}
/** True when `command` is a hook command this package writes, by argv
 *  shape — whatever node binary or install location it names. */
export declare function isManagedHookCommand(command: string): boolean;
/** Build the plan: which of PreToolUse/PostToolUse/PostToolUseFailure/SessionEnd/Stop need our
 *  entry added, preserving every other key and every other entry untouched
 *  (even entries this module can't fully type, e.g. a non-`command` hook
 *  type such as `http`/`mcp_tool`/`prompt` — those are passed through as-is).
 *
 *  When `opts.command` is itself a managed shape, any OTHER managed command
 *  in a managed event is stale — written by another Node, another install,
 *  or with other arguments — and is replaced rather than left beside the new
 *  one: two of our hooks on one event would record every call twice and
 *  keep gating with whatever the stale one says, and a stale one whose
 *  cli.js is gone exits 1, which Claude Code treats as non-blocking — the
 *  gate silently off. A `--command` that is not a managed shape keeps the
 *  old behaviour: exact-match idempotence, nothing else removed. */
export declare function planHookInstall(root: Record<string, unknown>, opts: HookInstallOpts): HookInstallPlan;
export interface HookUndoPlan {
    root: Record<string, unknown>;
    /** Event types an entry was removed from this run. */
    removed: ManagedEvent[];
}
/** Remove every hook command of ours from the managed events: the exact
 *  `opts.command` (a custom `--command` included), and any command of the
 *  managed SHAPE, whichever node binary or install location it names — so
 *  undo still works after an nvm switch or an upgrade moved either path. An
 *  entry with other hooks alongside ours keeps those; an entry left with
 *  zero hooks is dropped entirely. A hook that is not ours, and everything
 *  else in `root` (or in `root.hooks` for an event this module doesn't
 *  manage), is never touched. */
export declare function planHookUndo(root: Record<string, unknown>, opts: Pick<HookInstallOpts, 'command'>): HookUndoPlan;
export {};
