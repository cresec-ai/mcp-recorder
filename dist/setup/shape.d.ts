/**
 * Recognising this recorder's own invocations — a wrapped server entry
 * (`record … -- <original>`) or a Claude Code hook command (`hook …`) — by
 * the SHAPE of their argv, never by a directory name or an exact path.
 *
 * The node and cli.js paths an install writes are `process.execPath` and
 * that install's own `dist/cli.js`, and both move: an nvm switch changes the
 * first, an upgrade or a re-clone the second. Recognition by exact string
 * meant `hook install --undo` stopped finding the hook it wrote after either
 * one, and recognition by a directory name containing `mcp-recorder` meant
 * an unrelated server living under such a directory counted as ours. The
 * shapes recognised here are exactly the ones this package writes:
 *
 *   <node> <…/dist/cli.js> <sub> …                    (wrapper: local)
 *   npx [-y …] [@scope/]mcp-recorder[@version] <sub> … (wrapper: npx)
 *   mcp-recorder <sub> …                              (a global install)
 *   wsl.exe [-d <distro>] -e <any of the above>       (wrapper: wsl)
 *
 * The `local` form alone is not specific enough: `<node> <…/dist/cli.js>
 * record` is also how any other Node CLI built to `dist/` is launched. So a
 * `dist/cli.js` counts as ours only with a recorder-specific marker (see
 * {@link isRecorderCliPath}): it is this install's own path (or the one the
 * caller names), a path segment is or ends with `mcp-recorder`, or the
 * package.json beside its `dist/` names `mcp-recorder`. A command with none
 * of these is not ours and is never rewritten, replaced or removed.
 *
 * The only filesystem access is that read-only package.json lookup; doctor
 * does its own existence checks on {@link RecorderInvocation.cliPath}.
 */
export type RecorderSubcommand = 'record' | 'hook';
export interface RecorderInvocation {
    form: 'local' | 'npx' | 'global';
    /** True when the invocation sits behind a `wsl.exe … -e` prefix. */
    wsl: boolean;
    /** Index (in the argv given) of the node token — `local` form only. */
    nodeIndex?: number;
    /** Index (in the argv given) of the `dist/cli.js` token — `local` form only. */
    cliIndex?: number;
    /** The node token's value — `local` form only. */
    nodePath?: string;
    /** The `dist/cli.js` token's value — `local` form only. */
    cliPath?: string;
    /** Index (in the argv given) of the subcommand token. */
    subIndex: number;
}
/** The last path segment, splitting on both separators (a Windows-side
 *  config carries backslashes even when this runs on Linux). */
export declare function pathBaseName(p: string): string;
/** Any path ending in `dist/cli.js` (either separator), relative or absolute. */
export declare function isCliJsPath(t: unknown): t is string;
/** Options for recognising the `local` form. */
export interface ShapeOpts {
    /** Another path to accept as ours outright — the install the caller acts
     *  for (setup's `localWrapperPath`, doctor's `cliPath`). */
    localWrapperPath?: string;
    /** Where a relative `dist/cli.js` resolves for the package.json lookup.
     *  Default `process.cwd()`. */
    cwd?: string;
}
/** Path equality as the host filesystem sees it: exact on POSIX; on Windows
 *  case-insensitive (drive letter included) and indifferent to `/` vs `\`. */
export declare function samePath(a: string, b: string, platform?: NodeJS.Platform): boolean;
/**
 * True when `cliPath` (already known to end in `dist/cli.js`) carries a
 * recorder-specific marker: (a) it is this install's path or
 * `opts.localWrapperPath`; (b) one of its path segments is or ends with
 * `mcp-recorder` (`node_modules/@cresec/mcp-recorder`, a `mcp-recorder`
 * checkout); (c) `<its dist/>/../package.json` exists and names
 * `mcp-recorder` or `<scope>/mcp-recorder`. A stale path whose file is gone
 * is still recognised by (b); a moved checkout in a directory with no
 * marker, whose files are gone, is not — and is then left alone.
 */
export declare function isRecorderCliPath(cliPath: string, opts?: ShapeOpts): boolean;
/**
 * Where `argv` invokes this recorder's `sub` subcommand, in one of the
 * shapes listed above — or undefined when it does not. The match must start
 * at the very beginning of argv (after leading `NAME=value` assignments, or
 * after a `wsl.exe … -e` prefix): a recorder invocation buried inside some
 * other program's arguments is that program's business, not ours.
 */
export declare function matchRecorderInvocation(argv: readonly unknown[], sub: RecorderSubcommand, opts?: ShapeOpts): RecorderInvocation | undefined;
/**
 * Split a hook `command` string into words the way a POSIX shell would for
 * the quoting this package writes (see `shellQuote` in src/hook/install.ts):
 * double quotes with `\"`, `\\`, `\$`, `` \` `` escapes, single quotes taken
 * literally, backslash escaping one character outside quotes. Anything past
 * a command separator (`;`, `&`, `|`) is cut off — only the first simple
 * command is the hook's own program. Never throws; an unterminated quote
 * simply ends the last word.
 */
export declare function shellWords(command: string): string[];
/** A hook `command` string's recorder invocation, when it is one of ours. */
export declare function matchHookCommand(command: string, opts?: ShapeOpts): RecorderInvocation | undefined;
