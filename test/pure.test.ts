import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { writeFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './fixture/api.mjs';
import { ConfigSchema, type Config } from '../src/config/schema.js';
import { runGoldens } from '../src/run.js';

let url: string;
let close: () => Promise<void>;
let dir: string;
let countFile: string;
let config: Config;

// A reset "command" that just records each invocation, so we can count resets.
const counter = fileURLToPath(new URL('./fixture/count-reset.mjs', import.meta.url));

beforeAll(async () => {
  const s = await start(0);
  url = s.url;
  close = s.close;
  dir = await mkdtemp(join(tmpdir(), 'gtr-pure-'));
  countFile = join(dir, 'count');
  process.env.GTR_RESET_COUNT = countFile;
  config = ConfigSchema.parse({
    baseUrl: url,
    reset: { enabled: true, command: `node ${counter}` },
  });
});

afterAll(async () => {
  await close();
  await rm(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  await writeFile(countFile, '', 'utf8');
});

// Each scenario is a single read-only GET that 404s deterministically (no DB state).
function goldenYaml(name: string, pure: boolean): string {
  return [
    `name: ${name}`,
    pure ? 'pure: true' : '# not pure',
    'steps:',
    '  - name: s',
    '    rest: { method: GET, path: /api/users/00000000-0000-0000-0000-000000000000 }',
    '    response:',
    '      status: 404',
    '      body: { error: not found }',
  ].join('\n');
}

async function writeGoldens(bPure: boolean): Promise<string[]> {
  const files = [
    [join(dir, '1-a.golden.yaml'), goldenYaml('a', false)],
    [join(dir, '2-b.golden.yaml'), goldenYaml('b', bPure)],
    [join(dir, '3-c.golden.yaml'), goldenYaml('c', false)],
  ] as const;
  for (const [f, c] of files) await writeFile(f, c, 'utf8');
  return files.map(([f]) => f);
}

async function resetCount(): Promise<number> {
  return (await readFile(countFile, 'utf8')).length;
}

describe('pure reset optimization', () => {
  it('skips the reset before a scenario that follows a pure one', async () => {
    const files = await writeGoldens(true);
    const summary = await runGoldens(files, config);
    expect(summary.ok).toBe(true);
    // reset before A (1) + before B (2); skipped before C because B is pure.
    expect(await resetCount()).toBe(2);
  });

  it('resets before every scenario when none are pure', async () => {
    const files = await writeGoldens(false);
    await runGoldens(files, config);
    expect(await resetCount()).toBe(3);
  });
});
