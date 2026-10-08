/**
 * `protect`, `setup` and `hook install` write this install's absolute cli.js
 * path into the client's config. Run through npx, that path lives in npm's
 * `_npx/<hash>/` cache, which npm prunes, so the three refuse with exit 2 and
 * point at a global install instead. `--undo` only removes entries and still
 * runs.
 *
 * The npx layout is reproduced with a symlink to this checkout under a
 * `_npx/` directory, run with --preserve-symlinks so the CLI sees that path.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function npxLayout(): { cli: string; project: string; dataDir: string } {
  const base = mkdtempSync(join(tmpdir(), 'mcp-recorder-npx-'));
  dirs.push(base);
  const scope = join(base, '_npx', '0a1b2c3d', 'node_modules', '@cresec');
  mkdirSync(scope, { recursive: true });
  symlinkSync(ROOT, join(scope, 'mcp-recorder'), process.platform === 'win32' ? 'junction' : 'dir');
  const project = join(base, 'project');
  mkdirSync(project);
  writeFileSync(join(project, '.mcp.json'), JSON.stringify({ mcpServers: { fs: { command: 'node', args: ['server.js'] } } }));
  return { cli: join(scope, 'mcp-recorder', 'dist', 'cli.js'), project, dataDir: join(base, 'data') };
}

function run(cli: string, cwd: string, args: string[]) {
  return spawnSync(process.execPath, ['--preserve-symlinks', '--preserve-symlinks-main', cli, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, MCP_RECORDER_DISABLE: undefined, MCP_RECORDER_POLICY: undefined, MCP_RECORDER_DATA_DIR: undefined },
  });
}

describe('installing from the npx cache', () => {
  for (const args of [
    ['protect', '--client', 'claude-code'],
    ['setup', '--client', 'claude-code'],
    ['hook', 'install'],
  ]) {
    it(`${args.slice(0, 2).join(' ')} exits 2, names the global install and writes nothing`, () => {
      const { cli, project, dataDir } = npxLayout();
      const before = readFileSync(join(project, '.mcp.json'), 'utf8');
      const r = run(cli, project, [...args, '--data-dir', dataDir]);
      expect(r.status, r.stderr).toBe(2);
      expect(r.stderr).toContain("npx's temporary cache");
      expect(r.stderr).toContain('npm install -g @cresec/mcp-recorder, then mcp-recorder protect');
      expect(readFileSync(join(project, '.mcp.json'), 'utf8')).toBe(before);
      expect(existsSync(join(project, '.claude'))).toBe(false);
      expect(existsSync(dataDir)).toBe(false);
    }, 60_000);
  }

  it('--undo still runs from the npx cache', () => {
    const { cli, project } = npxLayout();
    const r = run(cli, project, ['hook', 'install', '--undo']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).not.toContain("npx's temporary cache");
  }, 60_000);

  for (const args of [
    ['setup', '--client', 'claude-code', '--wrapper', 'npx', '--dry-run'],
    ['hook', 'install', '--command', 'mcp-recorder hook', '--dry-run'],
    ['protect', '--client', 'cursor', '--wrapper', 'npx', '--dry-run'],
  ]) {
    it(`${args.join(' ')} writes no local path and is not refused`, () => {
      const { cli, project, dataDir } = npxLayout();
      const r = run(cli, project, [...args, '--data-dir', dataDir]);
      expect(r.stderr).not.toContain("npx's temporary cache");
    }, 60_000);
  }

  it('protect --client claude-code --wrapper npx is still refused: the hook would use the cache path', () => {
    const { cli, project, dataDir } = npxLayout();
    const r = run(cli, project, ['protect', '--client', 'claude-code', '--wrapper', 'npx', '--data-dir', dataDir]);
    expect(r.status, r.stderr).toBe(2);
    expect(r.stderr).toContain("npx's temporary cache");
  }, 60_000);

  it('a dry run is refused like the real run', () => {
    const { cli, project, dataDir } = npxLayout();
    const r = run(cli, project, ['protect', '--client', 'claude-code', '--dry-run', '--data-dir', dataDir]);
    expect(r.status, r.stderr).toBe(2);
  }, 60_000);

  it('a global install path is not refused', () => {
    const r = spawnSync(process.execPath, [join(ROOT, 'dist', 'cli.js'), 'setup', '--client', 'claude-code', '--dry-run'], {
      cwd: npxLayout().project,
      encoding: 'utf8',
      timeout: 60_000,
    });
    expect(r.stderr).not.toContain("npx's temporary cache");
  }, 60_000);
});
