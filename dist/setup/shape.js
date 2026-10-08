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
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
/** The last path segment, splitting on both separators (a Windows-side
 *  config carries backslashes even when this runs on Linux). */
export function pathBaseName(p) {
    const parts = p.split(/[\\/]/);
    return parts[parts.length - 1] ?? '';
}
/** `node`, `nodejs`, `node22`, `node.exe` — the interpreter, wherever it lives. */
function isNodeToken(t) {
    return typeof t === 'string' && /^node(js)?\d*(\.exe)?$/i.test(pathBaseName(t));
}
/** Any path ending in `dist/cli.js` (either separator), relative or absolute. */
export function isCliJsPath(t) {
    return typeof t === 'string' && /(^|[\\/])dist[\\/]cli\.js$/.test(t);
}
/** This running install's own `dist/cli.js`, the same path cli.ts's
 *  `resolveLocalWrapperPath` computes (this file is `<root>/dist/setup/` or,
 *  under tsx, `<root>/src/setup/`). */
const THIS_INSTALL_CLI = join(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'), 'dist', 'cli.js');
/** Path equality as the host filesystem sees it: exact on POSIX; on Windows
 *  case-insensitive (drive letter included) and indifferent to `/` vs `\`. */
export function samePath(a, b, platform = process.platform) {
    if (a === b)
        return true;
    if (platform !== 'win32')
        return false;
    const norm = (p) => win32.normalize(p).toLowerCase();
    return norm(a) === norm(b);
}
function isRecorderPackageName(name) {
    return typeof name === 'string' && (name === 'mcp-recorder' || name.endsWith('/mcp-recorder'));
}
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
export function isRecorderCliPath(cliPath, opts = {}) {
    if (samePath(cliPath, THIS_INSTALL_CLI) || (opts.localWrapperPath !== undefined && samePath(cliPath, opts.localWrapperPath))) {
        return true;
    }
    if (cliPath.split(/[\\/]/).some((seg) => seg.endsWith('mcp-recorder')))
        return true;
    try {
        const abs = isAbsolute(cliPath) ? cliPath : resolve(opts.cwd ?? process.cwd(), cliPath);
        const pkg = JSON.parse(readFileSync(join(dirname(dirname(abs)), 'package.json'), 'utf8'));
        return typeof pkg === 'object' && pkg !== null && isRecorderPackageName(pkg.name);
    }
    catch {
        return false;
    }
}
function isNpxToken(t) {
    return typeof t === 'string' && /^npx(\.cmd|\.exe)?$/i.test(pathBaseName(t));
}
/** `mcp-recorder`, `@cresec/mcp-recorder`, `@any-scope/mcp-recorder@0.2.0`. */
function isPackageSpec(t) {
    return typeof t === 'string' && /^(@[^/\s]+\/)?mcp-recorder(@\S*)?$/.test(t);
}
function isGlobalBinary(t) {
    return typeof t === 'string' && /^mcp-recorder(\.cmd|\.exe|\.ps1)?$/i.test(pathBaseName(t));
}
function isWslToken(t) {
    return typeof t === 'string' && /^wsl(\.exe)?$/i.test(pathBaseName(t));
}
/** A leading `NAME=value` environment assignment in a shell command. */
function isEnvAssignment(t) {
    return typeof t === 'string' && /^[A-Za-z_][A-Za-z0-9_]*=/.test(t);
}
function matchAt(argv, i, sub, wsl, opts) {
    const head = argv[i];
    const cli = argv[i + 1];
    if (isNodeToken(head) && isCliJsPath(cli) && argv[i + 2] === sub && isRecorderCliPath(cli, opts)) {
        return { form: 'local', wsl, nodeIndex: i, cliIndex: i + 1, nodePath: head, cliPath: argv[i + 1], subIndex: i + 2 };
    }
    if (isNpxToken(head)) {
        let j = i + 1;
        while (typeof argv[j] === 'string' && argv[j].startsWith('-'))
            j++;
        if (isPackageSpec(argv[j]) && argv[j + 1] === sub)
            return { form: 'npx', wsl, subIndex: j + 1 };
        return undefined;
    }
    if (isGlobalBinary(head) && argv[i + 1] === sub)
        return { form: 'global', wsl, subIndex: i + 1 };
    return undefined;
}
/**
 * Where `argv` invokes this recorder's `sub` subcommand, in one of the
 * shapes listed above — or undefined when it does not. The match must start
 * at the very beginning of argv (after leading `NAME=value` assignments, or
 * after a `wsl.exe … -e` prefix): a recorder invocation buried inside some
 * other program's arguments is that program's business, not ours.
 */
export function matchRecorderInvocation(argv, sub, opts = {}) {
    let i = 0;
    while (isEnvAssignment(argv[i]))
        i++;
    if (isWslToken(argv[i])) {
        for (let j = i + 1; j < argv.length; j++) {
            if (argv[j] === '-e' || argv[j] === '--exec')
                return matchAt(argv, j + 1, sub, true, opts);
            if (argv[j] === '--')
                return undefined;
        }
        return undefined;
    }
    return matchAt(argv, i, sub, false, opts);
}
/**
 * Split a hook `command` string into words the way a POSIX shell would for
 * the quoting this package writes (see `shellQuote` in src/hook/install.ts):
 * double quotes with `\"`, `\\`, `\$`, `` \` `` escapes, single quotes taken
 * literally, backslash escaping one character outside quotes. Anything past
 * a command separator (`;`, `&`, `|`) is cut off — only the first simple
 * command is the hook's own program. Never throws; an unterminated quote
 * simply ends the last word.
 */
export function shellWords(command) {
    const words = [];
    let cur = '';
    let inWord = false;
    let i = 0;
    while (i < command.length) {
        const c = command[i];
        if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
            if (inWord)
                words.push(cur);
            cur = '';
            inWord = false;
            i++;
            continue;
        }
        if (c === ';' || c === '&' || c === '|')
            break;
        inWord = true;
        if (c === "'") {
            const end = command.indexOf("'", i + 1);
            const stop = end === -1 ? command.length : end;
            cur += command.slice(i + 1, stop);
            i = stop + 1;
            continue;
        }
        if (c === '"') {
            i++;
            while (i < command.length && command[i] !== '"') {
                const d = command[i];
                if (d === '\\' && i + 1 < command.length && '"\\$`'.includes(command[i + 1])) {
                    cur += command[i + 1];
                    i += 2;
                    continue;
                }
                cur += d;
                i++;
            }
            i++; // the closing quote
            continue;
        }
        if (c === '\\' && i + 1 < command.length) {
            cur += command[i + 1];
            i += 2;
            continue;
        }
        cur += c;
        i++;
    }
    if (inWord)
        words.push(cur);
    return words;
}
/** A hook `command` string's recorder invocation, when it is one of ours. */
export function matchHookCommand(command, opts = {}) {
    return matchRecorderInvocation(shellWords(command), 'hook', opts);
}
//# sourceMappingURL=shape.js.map