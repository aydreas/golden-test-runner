import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { start } from './fixture/api.mjs';
import { ConfigSchema, type Config } from '../src/config/schema.js';
import { buildGolden } from '../src/golden/generate.js';
import { parseSpec } from '../src/spec/parse.js';

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
      matchers: [{ path: '$..id', type: 'uuid' }],
    },
  });
});

afterAll(async () => {
  await close();
});

const specFile = fileURLToPath(new URL('../examples/signup.spec.yaml', import.meta.url));

describe('generate / symbolize', () => {
  it('symbolizes captures, reuse sites, ignores; keeps representative matched values', async () => {
    const spec = await parseSpec(specFile);
    const golden = await buildGolden(spec, config, { now: '2026-06-10T00:00:00.000Z' });

    const [createUser, createPost, login] = golden.steps;
    const cuBody = createUser!.response.body as any;
    const cpBody = createPost!.response.body as any;
    const loginBody = login!.response.body as any;

    // capture source -> {{userId}}
    expect(cuBody.data.createUser.id).toBe('{{userId}}');
    // ignore path -> sentinel
    expect(cuBody.data.createUser.createdAt).toBe('<<ignore>>');

    // reuse site (== userId) -> {{userId}}
    expect(cpBody.data.createPost.author.id).toBe('{{userId}}');
    // uncaptured new uuid -> kept as a representative value (matcher handles it at compare)
    expect(cpBody.data.createPost.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(cpBody.data.createPost.id).not.toBe('{{userId}}');
    expect(cpBody.data.createPost.status).toBe('draft');

    // login: token captured -> {{token}}, issuedAt ignored
    expect(loginBody.token).toBe('{{token}}');
    expect(loginBody.issuedAt).toBe('<<ignore>>');

    // metadata
    expect(golden.specHash).toMatch(/^sha256:/);
    expect(golden.generatedAt).toBe('2026-06-10T00:00:00.000Z');
  });
});
