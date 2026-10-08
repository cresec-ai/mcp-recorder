/**
 * `src/setup/client-config.ts` — Claude Desktop config path resolution,
 * focused on the win32 MSIX (Microsoft Store) fallback. `claudeDesktopConfigPath`
 * takes `fileExists`/`listDir`/`platform`/`env` as injectable parameters (the
 * same pattern `src/proxy/spawn.ts` uses), so the win32 branch is fully
 * testable on any host by simulating `platform: 'win32'` — no real Windows
 * machine, and no `describe.skipIf`, required.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  claudeCodeLocalScopeServers,
  claudeDesktopConfigPath,
  isClaudeCodeConfig,
  localScopeUnreadableLine,
  localScopeWarningLines,
  resolveClientConfigPath,
} from '../src/setup/client-config.js';

const WIN_ENV = { APPDATA: 'C:\\Users\\joni\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\joni\\AppData\\Local' };
const APPDATA_PRIMARY = 'C:\\Users\\joni\\AppData\\Roaming\\Claude\\claude_desktop_config.json';
const PACKAGES_DIR = 'C:\\Users\\joni\\AppData\\Local\\Packages';

function msixPath(pkg: string): string {
  return `${PACKAGES_DIR}\\${pkg}\\LocalCache\\Roaming\\Claude\\claude_desktop_config.json`;
}

function existsAmong(paths: readonly string[]): (p: string) => boolean {
  const set = new Set(paths);
  return (p) => set.has(p);
}

describe('claudeDesktopConfigPath — win32 MSIX fallback', () => {
  it('darwin: unaffected by any of this, ignores fileExists/listDir entirely', () => {
    const resolved = claudeDesktopConfigPath(
      () => {
        throw new Error('must not be called on darwin');
      },
      () => {
        throw new Error('must not be called on darwin');
      },
      'darwin',
      {},
    );
    expect(resolved.path).toMatch(/Library\/Application Support\/Claude\/claude_desktop_config\.json$/);
    expect(resolved.note).toBeUndefined();
  });

  it('win32: %APPDATA%\\Claude\\... is preferred outright when it exists — MSIX never even looked up', () => {
    const readdir = (): string[] => {
      throw new Error('must not be called when the primary config already exists');
    };
    const resolved = claudeDesktopConfigPath(existsAmong([APPDATA_PRIMARY]), readdir, 'win32', WIN_ENV);
    expect(resolved).toEqual({ path: APPDATA_PRIMARY });
  });

  it('win32: primary missing, exactly one Claude_* MSIX package with a config — uses it, with a note', () => {
    const pkg = msixPath('Claude_pzs8sxrjxfjjc');
    const readdir = (p: string): string[] => {
      expect(p).toBe(PACKAGES_DIR);
      return ['Claude_pzs8sxrjxfjjc'];
    };
    const resolved = claudeDesktopConfigPath(existsAmong([pkg]), readdir, 'win32', WIN_ENV);
    expect(resolved.path).toBe(pkg);
    expect(resolved.note).toContain(pkg);
    expect(resolved.note).toMatch(/MSIX|Microsoft Store/);
  });

  it('win32: primary missing, several Claude_* MSIX matches exist — throws naming them, tells to use --config', () => {
    const pkg1 = msixPath('Claude_aaaa');
    const pkg2 = msixPath('Claude_bbbb');
    const readdir = (): string[] => ['Claude_aaaa', 'Claude_bbbb'];
    expect(() => claudeDesktopConfigPath(existsAmong([pkg1, pkg2]), readdir, 'win32', WIN_ENV)).toThrow(/--config/);
    try {
      claudeDesktopConfigPath(existsAmong([pkg1, pkg2]), readdir, 'win32', WIN_ENV);
      expect.unreachable();
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : String(cause);
      expect(msg).toContain(pkg1);
      expect(msg).toContain(pkg2);
    }
  });

  it('win32: neither the primary nor any Claude_* MSIX package exists — falls back to the primary path, with a note', () => {
    const readdir = (): string[] => ['Claude_pzs8sxrjxfjjc']; // dir matches, but its config file doesn't exist
    const resolved = claudeDesktopConfigPath(() => false, readdir, 'win32', WIN_ENV);
    expect(resolved.path).toBe(APPDATA_PRIMARY);
    expect(resolved.note).toContain(msixPath('Claude_pzs8sxrjxfjjc'));
  });

  it('win32: no Packages dir at all (readdir throws) — falls back to the primary path, with a note, no crash', () => {
    const readdir = (): string[] => {
      throw new Error('ENOENT');
    };
    const resolved = claudeDesktopConfigPath(() => false, readdir, 'win32', WIN_ENV);
    expect(resolved.path).toBe(APPDATA_PRIMARY);
    expect(resolved.note).toBeDefined();
  });

  it('win32: only non-Claude_ package directories present — treated the same as none found', () => {
    const readdir = (): string[] => ['SomeOtherVendor_abc123', 'Claude'];
    const resolved = claudeDesktopConfigPath(() => false, readdir, 'win32', WIN_ENV);
    expect(resolved.path).toBe(APPDATA_PRIMARY);
  });

  it('win32: falls back to homedir()-derived defaults when APPDATA/LOCALAPPDATA are unset', () => {
    const resolved = claudeDesktopConfigPath(() => false, () => [], 'win32', {});
    expect(resolved.path).toMatch(/AppData[\\/]Roaming[\\/]Claude[\\/]claude_desktop_config\.json$/);
  });
});

/* --------------------- resolveClientConfigPath — win32 -------------------- */

// resolveClientConfigPath calls the *real* claudeDesktopConfigPath()
// internally (platform defaults to process.platform, not injectable through
// resolveClientConfigPath's own signature — only fileExists is), so this
// only makes sense to run on an actual win32 host; see the platform-injected
// assertions above for the portable coverage of the same MSIX logic.
describe.skipIf(process.platform !== 'win32')('resolveClientConfigPath — win32 (not WSL)', () => {
  // On native win32, detectWsl() always returns inWsl: false (it only ever
  // returns true on linux), so resolveClientConfigPath's WSL fallback is a
  // no-op there and claudeDesktopConfigPath's own MSIX resolution decides
  // the path outright — including its note, which must survive the pass
  // through resolveWithWslFallback's early-return branch.
  it('propagates the MSIX note through when running natively on win32 (inWsl: false)', () => {
    // Only fileExists is injectable here, so the primary path and the
    // Packages listing come from the runner's real environment: with nothing
    // "existing", the result is the real %APPDATA% primary plus the note that
    // the MSIX location was checked — which is exactly what must survive
    // resolveWithWslFallback's early return.
    const resolved = resolveClientConfigPath(
      'claude-desktop',
      undefined,
      '/cwd',
      { inWsl: false, homeCandidates: () => [] },
      () => false,
    );
    expect(resolved.path).toMatch(/AppData[\\/]Roaming[\\/]Claude[\\/]claude_desktop_config\.json$/);
    expect(resolved.note).toMatch(/MSIX|Microsoft Store/);
  });
});

/* --- R6: Claude Code local-scope servers in ~/.claude.json ---------------- */

describe('claudeCodeLocalScopeServers — ~/.claude.json projects[<cwd>].mcpServers (read-only)', () => {
  const cleanups: string[] = [];
  afterEach(() => {
    for (const dir of cleanups.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  /** A temporary HOME and a temporary project directory. */
  function fixture(): { home: string; project: string; claudeJson: string } {
    const home = mkdtempSync(join(tmpdir(), 'r6-home-'));
    const project = mkdtempSync(join(tmpdir(), 'r6-project-'));
    cleanups.push(home, project);
    return { home, project, claudeJson: join(home, '.claude.json') };
  }

  it('names the servers stored for this project, and the warning says what to do', () => {
    const { home, project, claudeJson } = fixture();
    writeFileSync(
      claudeJson,
      JSON.stringify({
        mcpServers: { userScoped: { command: 'x' } },
        projects: { [project]: { mcpServers: { notes: { command: 'node', args: ['n.js'] }, tickets: { type: 'http', url: 'https://x' } } } },
      }),
    );
    const before = readFileSync(claudeJson);
    const found = claudeCodeLocalScopeServers(project, home);
    expect(found).toEqual({ kind: 'found', claudeJsonPath: claudeJson, project, names: ['notes', 'tickets'] });
    if (found.kind !== 'found') throw new Error('unreachable');
    const text = localScopeWarningLines(found).join('\n');
    expect(text).toContain('notes, tickets');
    expect(text).toContain('local-scope');
    expect(text).toContain('claude mcp add --scope project');
    expect(text).toContain('.mcp.json');
    expect(text).toContain('mcp-recorder protect');
    // Read-only: the file is byte-for-byte what it was.
    expect(readFileSync(claudeJson).equals(before)).toBe(true);
  });

  it('states the hook sentence as fact only when the caller knows the hook is installed', () => {
    const found = { claudeJsonPath: '/h/.claude.json', project: '/p', names: ['notes'] };
    const conditional = localScopeWarningLines(found).join('\n');
    expect(conditional).toContain('If the Claude Code hook is installed (protect installs it), its deny rules still apply to their mcp__ tools.');
    const plain = localScopeWarningLines(found, true).join('\n');
    expect(plain).toContain('The Claude Code hook still applies its deny rules to their mcp__ tools.');
    expect(plain).not.toContain('If the Claude Code hook is installed');
  });

  it('is "none" when ~/.claude.json does not exist', () => {
    const { home, project } = fixture();
    expect(claudeCodeLocalScopeServers(project, home)).toEqual({ kind: 'none' });
  });

  it('is "unreadable", with the reason — never a throw — when ~/.claude.json is not valid JSON', () => {
    const { home, project, claudeJson } = fixture();
    for (const text of ['{ "projects": ', 'not json at all']) {
      writeFileSync(claudeJson, text);
      const r = claudeCodeLocalScopeServers(project, home);
      expect(r.kind, text).toBe('unreadable');
      if (r.kind !== 'unreadable') throw new Error('unreachable');
      expect(r.claudeJsonPath).toBe(claudeJson);
      expect(r.reason).toContain('not valid JSON');
      expect(localScopeUnreadableLine(r)).toContain(`could not check ${claudeJson}`);
      expect(readFileSync(claudeJson, 'utf8')).toBe(text);
    }
  });

  it('is "unreadable" when ~/.claude.json exists but cannot be read', () => {
    const { home, project, claudeJson } = fixture();
    // A directory where the file should be: exists, and reading it fails (EISDIR).
    mkdirSync(claudeJson);
    expect(claudeCodeLocalScopeServers(project, home).kind).toBe('unreadable');
  });

  it('valid JSON of an odd shape, or with no entry for this project, is "none"', () => {
    const { home, project, claudeJson } = fixture();
    for (const text of ['null', '[]', '{}', '{"projects": []}', `{"projects": {${JSON.stringify(project)}: {"mcpServers": []}}}`]) {
      writeFileSync(claudeJson, text);
      expect(claudeCodeLocalScopeServers(project, home), text).toEqual({ kind: 'none' });
      expect(readFileSync(claudeJson, 'utf8')).toBe(text);
    }
  });

  it("does not report another project's servers, nor an empty mcpServers for this one", () => {
    const { home, project, claudeJson } = fixture();
    writeFileSync(
      claudeJson,
      JSON.stringify({
        projects: {
          [join(project, '..')]: { mcpServers: { parent: { command: 'x' } } },
          [join(project, 'sub')]: { mcpServers: { child: { command: 'x' } } },
          '/somewhere/else': { mcpServers: { other: { command: 'x' } } },
          [project]: { mcpServers: {} },
        },
      }),
    );
    const before = readFileSync(claudeJson);
    expect(claudeCodeLocalScopeServers(project, home)).toEqual({ kind: 'none' });
    expect(readFileSync(claudeJson).equals(before)).toBe(true);
  });

  it('infers Claude Code from a .mcp.json or .claude.json config when no --client is given', () => {
    expect(isClaudeCodeConfig(undefined, '/p/.mcp.json')).toBe(true);
    expect(isClaudeCodeConfig(undefined, '/home/me/.claude.json')).toBe(true);
    expect(isClaudeCodeConfig(undefined, '/p/claude_desktop_config.json')).toBe(false);
    expect(isClaudeCodeConfig('cursor', '/p/.mcp.json')).toBe(false);
    expect(isClaudeCodeConfig('claude-code', '/anything.json')).toBe(true);
  });
});
