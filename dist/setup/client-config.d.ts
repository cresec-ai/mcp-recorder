/**
 * `mcp-recorder setup` — resolving which client config file to edit.
 *
 * `--config PATH` always wins outright (this is also how tests exercise the
 * command, against a temp file, without needing a real client installed).
 * Otherwise `--client` picks a per-platform default location; `claude-code`
 * additionally prefers a `.mcp.json` in the current directory over
 * `~/.claude.json` when one exists, since that project-scoped config is
 * almost always what someone running `setup` from inside a project means.
 */
export type ClientKind = 'claude-desktop' | 'claude-code' | 'cursor';
export declare const CLIENT_KINDS: readonly ClientKind[];
export declare function isClientKind(value: string): value is ClientKind;
/**
 * Where Claude Desktop's config lives, per platform. On win32 there are two
 * install shapes: an ordinary installer, which uses `%APPDATA%\Claude\...`
 * (the primary, tried first and always preferred when it exists), and an
 * MSIX / Microsoft Store install, which is sandboxed into a
 * per-package-identity `LocalCache` under
 * `%LOCALAPPDATA%\Packages\Claude_<publisher-hash>\LocalCache\Roaming\Claude\...`
 * — `Claude_` plus an opaque hash that differs per machine, hence the
 * `Claude_*` glob. `fileExists`/`listDir` are injectable (real `fs` by
 * default) so this is testable by simulating `platform: 'win32'` on any
 * host, the same pattern `src/proxy/spawn.ts` uses.
 */
export declare function claudeDesktopConfigPath(fileExists?: (p: string) => boolean, listDir?: (p: string) => string[], platform?: NodeJS.Platform, env?: Readonly<Record<string, string | undefined>>): ResolvedConfigPath;
export interface ResolvedConfigPath {
    path: string;
    /** Set when the resolution made a choice worth telling the operator about
     * (e.g. preferring a project-local .mcp.json). Printed as a diagnostic. */
    note?: string;
}
/**
 * WSL context for {@link resolveClientConfigPath}: whether `setup` is
 * running inside WSL, plus a *lazy* way to discover Windows-side home
 * directories. `homeCandidates` is only invoked when actually needed (the
 * Linux-side config is missing and we are in WSL) since the real
 * implementation (`windowsHomeCandidates`) may shell out to `cmd.exe` —
 * callers pass `() => windowsHomeCandidates()` rather than a precomputed
 * list so that cost is never paid unnecessarily.
 */
export interface WslContext {
    inWsl: boolean;
    homeCandidates: () => string[];
}
/**
 * Resolve the client config file `setup` should edit. Only the top-level
 * `mcpServers` object is ever read or written — for `claude-code`'s
 * `~/.claude.json` that means the user-scope servers, not any per-project
 * overrides nested under a `projects` key.
 *
 * `wsl` (optional) enables the WSL-side fallback for `claude-desktop` and
 * `cursor` described on {@link resolveWithWslFallback}; `fileExists`
 * defaults to the real `fs.existsSync` and is only overridable for tests.
 */
export declare function resolveClientConfigPath(client: ClientKind | undefined, configFlag: string | undefined, cwd: string, wsl?: WslContext, fileExists?: (p: string) => boolean): ResolvedConfigPath;
/** Local-scope MCP servers Claude Code holds for one project directory. */
export interface LocalScopeServers {
    /** The `~/.claude.json` they were read from. */
    claudeJsonPath: string;
    /** The `projects` key that matched (the project's absolute path). */
    project: string;
    /** Server names under `projects[<project>].mcpServers`, in file order. */
    names: string[];
}
/**
 * The outcome of looking for local-scope servers. `none` (the file is
 * absent, or names no servers for this project) is kept apart from
 * `unreadable` (the file exists but could not be read or parsed): the second
 * means the question was NOT answered, and doctor must not fold that into a
 * pass.
 */
export type LocalScopeResult = {
    kind: 'none';
} | ({
    kind: 'found';
} & LocalScopeServers) | {
    kind: 'unreadable';
    claudeJsonPath: string;
    reason: string;
};
/**
 * Claude Code's LOCAL-scope MCP servers for `cwd`: `claude mcp add` with the
 * default `--scope local` stores them in `~/.claude.json` under
 * `projects[<absolute project path>].mcpServers`, private to that project —
 * neither the project's `.mcp.json` nor the user-scope top-level
 * `mcpServers` that `setup`/`protect` wrap.
 *
 * READ-ONLY: this file is Claude Code's own state, rewritten by it
 * constantly; nothing here ever writes it. Never throws. A file that does
 * not exist is `none`; one that exists but cannot be read or is not valid
 * JSON is `unreadable`, with the reason; valid JSON of an unexpected shape
 * (no `projects`, no entry for this project) is `none`. `home` defaults to
 * `os.homedir()`, which honours `HOME`.
 */
export declare function claudeCodeLocalScopeServers(cwd: string, home?: string): LocalScopeResult;
/**
 * Whether a config that `setup`/`protect`/`doctor` was pointed at is Claude
 * Code's: `--client claude-code`, or no `--client` and a config file named
 * `.mcp.json` or `.claude.json` — the two files only Claude Code reads.
 */
export declare function isClaudeCodeConfig(client: ClientKind | undefined, configPath: string): boolean;
/**
 * The warning for {@link claudeCodeLocalScopeServers}'s `found`: what is not
 * covered, how to cover it, and what still applies. `hookInstalled` says
 * whether the caller KNOWS the Claude Code hook is in place (protect, right
 * after installing it); otherwise the hook sentence is conditional, because
 * a standalone `setup` installs no hook. Lines carry no indentation of their
 * own beyond the continuation indent.
 */
export declare function localScopeWarningLines(found: LocalScopeServers, hookInstalled?: boolean): string[];
/** The one line `setup`/`protect` print when the file could not be checked. */
export declare function localScopeUnreadableLine(r: {
    claudeJsonPath: string;
    reason: string;
}): string;
