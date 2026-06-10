import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { start } from './fixture/api.mjs';
import { ConfigSchema, type Config } from '../src/config/schema.js';
import { buildGolden } from '../src/golden/generate.js';
import { parseSpec } from '../src/spec/parse.js';
import { runGoldenScenario } from '../src/run.js';
import type { Golden } from '../src/spec/types.js';

let url: string;
let close: () => Promise<void>;
let config: Config;

beforeAll(async () => {
  const s = await start(0);
  url = s.url;
  close = s.close;
  process.env.GOLDEN_FIXTURE_URL = url;
  config = ConfigSchema.parse({
    baseUrl: url,
    reset: {
      enabled: true,
      command: `node ${fileURLToPath(new URL('./fixture/reset.mjs', import.meta.url))}`,
    },
    normalize: {
      ignorePaths: ['$..createdAt', '$..issuedAt'],
      matchers: [
        { path: '$..id', type: 'uuid' },
        { path: '$..token', type: 'uuid' },
      ],
    },
  });
});

afterAll(async () => {
  await close();
});

const specFile = fileURLToPath(new URL('../examples/signup.spec.yaml', import.meta.url));

async function freshGolden(): Promise<Golden> {
  const spec = await parseSpec(specFile);
  return buildGolden(spec, config);
}

describe('run', () => {
  it('passes against a fresh DB (wildcards + matchers absorb new ids)', async () => {
    const golden = await freshGolden();
    const result = await runGoldenScenario(golden, 'mem://golden', config);
    if (!result.ok) console.error(JSON.stringify(result, null, 2));
    expect(result.ok).toBe(true);
    expect(result.steps).toHaveLength(3);
  });

  it('detects a changed expected value', async () => {
    const golden = await freshGolden();
    (golden.steps[1]!.response.body as any).data.createPost.title = 'Wrong Title';
    const result = await runGoldenScenario(golden, 'mem://golden', config);
    expect(result.ok).toBe(false);
    const bad = result.steps[1]!;
    expect(bad.ok).toBe(false);
    expect(bad.mismatches.some((m) => m.path === 'data.createPost.title' && m.kind === 'value')).toBe(true);
  });

  it('detects a status mismatch', async () => {
    const golden = await freshGolden();
    golden.steps[2]!.response.status = 201;
    const result = await runGoldenScenario(golden, 'mem://golden', config);
    expect(result.steps[2]!.statusMismatch).toEqual({ expected: 201, actual: 200 });
  });
});
