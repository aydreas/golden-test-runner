import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { start } from './fixture/api.mjs';
import { ConfigSchema, type Config } from '../src/config/schema.js';
import { Context } from '../src/engine/context.js';
import { executeStep } from '../src/transport/index.js';
import { applyCaptures } from '../src/engine/capture.js';
import { runReset, resetEnabled } from '../src/engine/reset.js';
import type { SpecStep } from '../src/spec/types.js';

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
  });
});

afterAll(async () => {
  await close();
});

describe('transport + engine integration', () => {
  it('chains a captured value across GraphQL steps', async () => {
    const ctx = new Context();

    const createUser: SpecStep = {
      name: 'create-user',
      graphql: {
        query: 'mutation($email:String!){createUser(email:$email){id email createdAt}}',
        variables: { email: 'alice@example.com' },
      },
      capture: { userId: '$.data.createUser.id' },
    };
    const r1 = await executeStep(createUser, config, ctx);
    expect(r1.response.status).toBe(200);
    applyCaptures(createUser.capture, r1.response.body, ctx);

    const createPost: SpecStep = {
      name: 'create-post',
      graphql: {
        query:
          'mutation($a:ID!,$t:String!){createPost(authorId:$a,title:$t){id title status author{id}}}',
        variables: { a: '{{userId}}', t: 'Hello' },
      },
    };
    const r2 = await executeStep(createPost, config, ctx);
    const body = r2.response.body as any;
    expect(body.data.createPost.author.id).toBe(ctx.get('userId'));
    expect(body.data.createPost.status).toBe('draft');
  });

  it('sends a REST request and captures from it', async () => {
    const ctx = new Context();
    const login: SpecStep = {
      name: 'login',
      rest: {
        method: 'POST',
        path: '/api/login',
        body: { email: 'a@example.com', password: 'secret' },
      },
      capture: { token: '$.token' },
    };
    const { request, response } = await executeStep(login, config, ctx);
    expect(request.kind).toBe('rest');
    expect(response.status).toBe(200);
    applyCaptures(login.capture, response.body, ctx);
    expect(ctx.get('token')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('runs the shell reset hook', async () => {
    expect(resetEnabled(config, undefined, false)).toBe(true);
    expect(resetEnabled(config, { reset: false }, false)).toBe(false);
    expect(resetEnabled(config, undefined, true)).toBe(false);
    await expect(runReset(config)).resolves.toBeUndefined();
  });
});
