/**
 * Stores written before 0.2.0.
 *
 * The evidence identifiers changed once, in 0.2.0, so a store written before
 * then breaks at seq 1 under this version. The inspection commands (verify,
 * ui, doctor, the sink) must say so in words, and the advice they give —
 * export it with this version — must actually work. Every identifier below
 * is made up: the point is "not the current format", not any real old one.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { predatesMessage, predatingSchema } from '../src/chain/format.js';
import { GENESIS_HASH, computeHash, sha256Hex } from '../src/chain/hash.js';
import { Signer } from '../src/chain/keys.js';
import { runDoctor } from '../src/doctor/run.js';
import { SCHEMA } from '../src/schema/events.js';
import type { AnyEvent, ChainRecord } from '../src/schema/events.js';
import { runShipper } from '../src/sink/shipper.js';
import { openStore } from '../src/store/index.js';
import { FILES } from '../src/types.js';
import { spawnTsxSync } from './helpers/tsx.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CLI = join(ROOT, 'src', 'cli.ts');

const MADE_UP_GENESIS = sha256Hex('example.recorder.genesis.v0');
const MADE_UP_SCHEMA = 'example.recorder.event.v0';

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function tempDir(tag: string): string {
  const dir = mkdtempSync(join(tmpdir(), `mcp-recorder-legacy-${tag}-`));
  dirs.push(dir);
  return dir;
}

function madeUpEvent(i: number): AnyEvent {
  return {
    schema: MADE_UP_SCHEMA,
    event_id: `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`,
    session_id: 'aaaaaaaa-0000-4000-8000-000000000000',
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
    kind: 'session_start',
    identity: { user: 'u', host: 'h', pid: 1 },
    server: { name: 'fixture', command_hash: `sha256:${'0'.repeat(64)}` },
    attributes: {},
    proxy_version: '0.0.0-example',
    cwd: '/tmp',
    redaction_mode: 'allowlist',
  } as unknown as AnyEvent;
}

/** A jsonl store chained from a made-up genesis with a made-up schema. */
async function seedPredatingStore(dataDir: string, count = 3): Promise<void> {
  await Signer.load(dataDir);
  const lines: string[] = [];
  let prev = MADE_UP_GENESIS;
  for (let i = 1; i <= count; i++) {
    const event = madeUpEvent(i);
    const record: ChainRecord = { seq: i, prev_hash: prev, hash: computeHash(prev, event), event };
    lines.push(JSON.stringify(record));
    prev = record.hash;
  }
  writeFileSync(join(dataDir, FILES.JSONL_LOG), lines.join('\n') + '\n');
}

function cli(args: string[]): { code: number | null; stdout: string; stderr: string } {
  const res = spawnTsxSync([CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, MCP_RECORDER_DATA_DIR: '', MCP_RECORDER_SINK: '' },
    timeout: 60_000,
  });
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

describe('predatingSchema', () => {
  it('names the schema of a seq 1 that matches neither the genesis nor the schema', () => {
    const event = madeUpEvent(1);
    const record: ChainRecord = { seq: 1, prev_hash: MADE_UP_GENESIS, hash: computeHash(MADE_UP_GENESIS, event), event };
    expect(predatingSchema(record)).toBe(MADE_UP_SCHEMA);
  });

  it('is silent when either signal is current, or the record is not seq 1', () => {
    const old = madeUpEvent(1);
    const current = { ...(old as object), schema: SCHEMA } as unknown as AnyEvent;
    expect(predatingSchema({ seq: 1, prev_hash: GENESIS_HASH, hash: computeHash(GENESIS_HASH, old), event: old })).toBeUndefined();
    expect(predatingSchema({ seq: 1, prev_hash: MADE_UP_GENESIS, hash: computeHash(MADE_UP_GENESIS, current), event: current })).toBeUndefined();
    expect(predatingSchema({ seq: 2, prev_hash: MADE_UP_GENESIS, hash: computeHash(MADE_UP_GENESIS, old), event: old })).toBeUndefined();
    expect(predatingSchema(undefined)).toBeUndefined();
  });
});

describe('a store written before 0.2.0', () => {
  it('verify fails and says the store predates the current format, naming its schema and data dir', async () => {
    const dataDir = tempDir('verify');
    await seedPredatingStore(dataDir);
    const res = cli(['verify', '--data-dir', dataDir, '--store', 'jsonl']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain(predatesMessage(MADE_UP_SCHEMA, dataDir));
  }, 60_000);

  it('a store in the current format that is merely broken does not get the message', async () => {
    const dataDir = tempDir('broken');
    await seedPredatingStore(dataDir);
    // Re-anchor seq 1 at the current genesis but leave the made-up schema:
    // the chain still breaks (hash mismatch), and that is tamper, not age.
    const lines = readFileSync(join(dataDir, FILES.JSONL_LOG), 'utf8').trim().split('\n');
    const first = JSON.parse(lines[0]!) as ChainRecord;
    lines[0] = JSON.stringify({ ...first, prev_hash: GENESIS_HASH });
    writeFileSync(join(dataDir, FILES.JSONL_LOG), lines.join('\n') + '\n');
    const res = cli(['verify', '--data-dir', dataDir, '--store', 'jsonl']);
    expect(res.code).toBe(1);
    expect(res.stderr).not.toContain('predates the current evidence format');
  }, 60_000);

  it('export with this version works, and the bundle verifies with its own verify.cjs', async () => {
    const dataDir = tempDir('export');
    await seedPredatingStore(dataDir);
    const bundleDir = join(dataDir, 'bundle');
    const exported = cli(['export', '--data-dir', dataDir, '--store', 'jsonl', '--dir', bundleDir]);
    expect(exported.code, exported.stderr).toBe(0);
    const verified = spawnSync(process.execPath, [join(bundleDir, 'verify.cjs')], { cwd: bundleDir, encoding: 'utf8' });
    expect(verified.status, verified.stdout + verified.stderr).toBe(0);
  }, 60_000);

  it('doctor C6 fails with the message first', async () => {
    const dataDir = tempDir('doctor');
    await seedPredatingStore(dataDir);
    const configPath = join(dataDir, 'mcp.json');
    writeFileSync(configPath, JSON.stringify({ mcpServers: {} }));
    const report = await runDoctor({
      configPath,
      dataDir,
      cliPath: join(ROOT, 'dist', 'cli.js'),
      probe: false,
      env: {},
    });
    const c6 = report.checks.find((c) => c.id === 'C6')!;
    expect(c6.status).toBe('FAIL');
    expect(c6.detail[0]).toBe(`  ${predatesMessage(MADE_UP_SCHEMA, dataDir)}`);
  });

  it('the sink stalls with the message rather than a bare genesis error', async () => {
    const dataDir = tempDir('sink');
    await seedPredatingStore(dataDir);
    const store = openStore({ dataDir, backend: 'jsonl' });
    try {
      const signer = await Signer.load(dataDir);
      const result = await runShipper({
        dataDir,
        sink: { url: 'http://127.0.0.1:9/', token: 't' },
        store,
        signer,
        toolVersion: '0.0.0-test',
        surface: 'ship',
        drain: true,
        drainTimeoutMs: 2_000,
        pollIntervalMs: 5,
        sleep: async () => {},
        log: () => {},
      });
      expect(result.state).toBe('stalled');
      expect(result.lastError).toBe(predatesMessage(MADE_UP_SCHEMA, dataDir));
    } finally {
      store.close();
    }
  });
});

describe('verify --bundle with an unrecognised bundle id', () => {
  it('points at the verifier the bundle carries', async () => {
    const dataDir = tempDir('bundle-id');
    await seedPredatingStore(dataDir);
    const bundleDir = join(dataDir, 'bundle');
    expect(cli(['export', '--data-dir', dataDir, '--store', 'jsonl', '--dir', bundleDir]).code).toBe(0);
    const manifestPath = join(bundleDir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    manifest.bundle = 'example.recorder.bundle.v0';
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    const res = cli(['verify', '--bundle', bundleDir]);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain('unrecognized bundle id');
    expect(res.stderr).toContain('run node verify.cjs inside the bundle: every bundle carries its own verifier');
  }, 60_000);
});
