import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { start } from './fixture/api.mjs';
import { ConfigSchema, type Config } from '../src/config/schema.js';
import { buildGolden } from '../src/golden/generate.js';
import { parseSpec } from '../src/spec/parse.js';
import { runGoldenScenario } from '../src/run.js';

let close: () => Promise<void>;
let config: Config;

beforeAll(async () => {
  const s = await start(0);
  close = s.close;
  process.env.GOLDEN_FIXTURE_URL = s.url;
  config = ConfigSchema.parse({
    baseUrl: s.url,
    reset: { enabled: true, command: `node ${fileURLToPath(new URL('./fixture/reset.mjs', import.meta.url))}` },
    normalize: { ignorePaths: ['$..createdAt', '$..issuedAt'], matchers: [{ path: '$..id', type: 'uuid' }, { path: '$..token', type: 'uuid' }] },
  });
});
afterAll(async () => { await close(); });

const specFile = fileURLToPath(new URL('../examples/signup.spec.yaml', import.meta.url));

describe('spec drift', () => {
  it('warns (passes) by default, fails under --strict', async () => {
    const golden = await buildGolden(await parseSpec(specFile), config);
    const stale = new Map([[golden.name, 'sha256:different']]);

    const warn = await runGoldenScenario(golden, 'g', config, { specHashes: stale });
    expect(warn.drift).toBeTruthy();
    expect(warn.ok).toBe(true); // warn-only

    const strict = await runGoldenScenario(golden, 'g', config, { specHashes: stale, strict: true });
    expect(strict.ok).toBe(false);

    const matching = new Map([[golden.name, golden.specHash!]]);
    const fresh = await runGoldenScenario(golden, 'g', config, { specHashes: matching, strict: true });
    expect(fresh.drift).toBeUndefined();
    expect(fresh.ok).toBe(true);
  });
});
