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
import { matchHookCommand } from '../setup/shape.js';
const TOOL_EVENTS = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure'];
const END_EVENTS = ['SessionEnd', 'Stop'];
const MANAGED_EVENTS = [...TOOL_EVENTS, ...END_EVENTS];
function isPlainObject(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isHookCommandEntry(v) {
    return isPlainObject(v) && v.type === 'command' && typeof v.command === 'string';
}
function isMatcherEntry(v) {
    return (isPlainObject(v) &&
        Array.isArray(v.hooks) &&
        v.hooks.every(isHookCommandEntry) &&
        (v.matcher === undefined || typeof v.matcher === 'string'));
}
function isToolEvent(event) {
    return TOOL_EVENTS.includes(event);
}
/** Quote one shell word: settings.json hook commands run through a shell
 *  (see the docs' own `${CLAUDE_PROJECT_DIR}/.claude/hooks/script.sh`
 *  example), so any path containing a space must be quoted. */
function shellQuote(s) {
    return `"${s.replace(/(["\\$`])/g, '\\$1')}"`;
}
/** Build the settings.json hook `command` string for this install. Mirrors
 *  src/setup/wrap.ts's `buildWrappedEntry` for `--wrapper local`: absolute
 *  node + absolute dist/cli.js, so the hook works regardless of the shell's
 *  cwd or PATH. */
export function buildHookCommand(opts) {
    const parts = [
        shellQuote(opts.execPath),
        shellQuote(opts.cliPath),
        'hook',
        '--data-dir',
        shellQuote(opts.dataDir),
    ];
    if (opts.policyPath !== undefined)
        parts.push('--policy', shellQuote(opts.policyPath));
    if (opts.clientName !== undefined)
        parts.push('--client', shellQuote(opts.clientName));
    if (opts.allTools)
        parts.push('--all-tools');
    return parts.join(' ');
}
/** True when `command` is a hook command this package writes, by argv
 *  shape — whatever node binary or install location it names. */
export function isManagedHookCommand(command) {
    return matchHookCommand(command) !== undefined;
}
function hooksArrayOf(root, event) {
    if (!isPlainObject(root.hooks))
        return [];
    const arr = root.hooks[event];
    return Array.isArray(arr) ? arr : [];
}
function hasOurCommand(entries, command) {
    return entries.some((e) => isMatcherEntry(e) && e.hooks.some((h) => h.command === command));
}
/** Drop every hook command `remove` selects from `entries`; a matcher entry
 *  left with no hooks is dropped, entries this module cannot type are kept
 *  as they are. `touched` says whether anything was removed. */
function withoutCommands(entries, remove) {
    let touched = false;
    const kept = [];
    for (const entryRaw of entries) {
        if (!isMatcherEntry(entryRaw)) {
            kept.push(entryRaw); // not ours to understand — leave it alone
            continue;
        }
        const keptHooks = entryRaw.hooks.filter((h) => !remove(h.command));
        if (keptHooks.length !== entryRaw.hooks.length)
            touched = true;
        if (keptHooks.length > 0) {
            kept.push(keptHooks.length === entryRaw.hooks.length ? entryRaw : { ...entryRaw, hooks: keptHooks });
        }
    }
    return { kept, touched };
}
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
export function planHookInstall(root, opts) {
    const nextHooks = isPlainObject(root.hooks) ? { ...root.hooks } : {};
    const added = [];
    const alreadyInstalled = [];
    const replaced = [];
    const replaceStale = isManagedHookCommand(opts.command);
    for (const event of MANAGED_EVENTS) {
        let existing = hooksArrayOf(root, event);
        if (replaceStale) {
            const { kept, touched } = withoutCommands(existing, (c) => c !== opts.command && isManagedHookCommand(c));
            if (touched) {
                replaced.push(event);
                existing = kept;
                if (kept.length > 0)
                    nextHooks[event] = kept;
                else
                    delete nextHooks[event];
            }
        }
        if (hasOurCommand(existing, opts.command)) {
            alreadyInstalled.push(event);
            continue;
        }
        const entry = isToolEvent(event)
            ? { matcher: opts.matcher, hooks: [{ type: 'command', command: opts.command }] }
            : { hooks: [{ type: 'command', command: opts.command }] };
        nextHooks[event] = [...existing, entry];
        added.push(event);
    }
    return { root: { ...root, hooks: nextHooks }, added, alreadyInstalled, replaced };
}
/** Remove every hook command of ours from the managed events: the exact
 *  `opts.command` (a custom `--command` included), and any command of the
 *  managed SHAPE, whichever node binary or install location it names — so
 *  undo still works after an nvm switch or an upgrade moved either path. An
 *  entry with other hooks alongside ours keeps those; an entry left with
 *  zero hooks is dropped entirely. A hook that is not ours, and everything
 *  else in `root` (or in `root.hooks` for an event this module doesn't
 *  manage), is never touched. */
export function planHookUndo(root, opts) {
    if (!isPlainObject(root.hooks))
        return { root, removed: [] };
    const nextHooks = { ...root.hooks };
    const removed = [];
    for (const event of MANAGED_EVENTS) {
        const existing = hooksArrayOf(root, event);
        if (existing.length === 0)
            continue;
        const { kept: filtered, touched } = withoutCommands(existing, (c) => c === opts.command || isManagedHookCommand(c));
        if (touched) {
            removed.push(event);
            if (filtered.length > 0)
                nextHooks[event] = filtered;
            else
                delete nextHooks[event]; // no entries left for this event: drop the key entirely
        }
    }
    return { root: { ...root, hooks: nextHooks }, removed };
}
//# sourceMappingURL=install.js.map