import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';
import { start } from './api.mjs';

let url: string;
let close: () => Promise<void>;

beforeAll(async () => {
  const s = await start(0);
  url = s.url;
  close = s.close;
});

afterAll(async () => {
  await close();
});

async function post(path: string, body: unknown) {
  const res = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

describe('fixture API', () => {
  it('creates and fetches a user over REST (uuid id + timestamp)', async () => {
    const created = await post('/api/users', { email: 'a@example.com' });
    expect(created.status).toBe(201);
    expect(created.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.body.createdAt).toBeTypeOf('string');

    const fetched = await fetch(`${url}/api/users/${created.body.id}`);
    expect(fetched.status).toBe(200);
    expect((await fetched.json()).email).toBe('a@example.com');
  });

  it('chains a GraphQL createUser -> createPost', async () => {
    const u = await post('/graphql', {
      query: 'mutation($e:String!){createUser(email:$e){id email createdAt}}',
      variables: { e: 'b@example.com' },
    });
    const userId = u.body.data.createUser.id;
    const p = await post('/graphql', {
      query: 'mutation($a:ID!,$t:String!){createPost(authorId:$a,title:$t){id title status author{id}}}',
      variables: { a: userId, t: 'Hello' },
    });
    expect(p.body.data.createPost.author.id).toBe(userId);
    expect(p.body.data.createPost.status).toBe('draft');
  });

  it('login returns a chainable token', async () => {
    const r = await post('/api/login', { email: 'a@example.com', password: 'x' });
    expect(r.body.token).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('shell reset.mjs clears the store', async () => {
    await post('/api/users', { email: 'c@example.com' });
    expect((await fetch(`${url}/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{posts{id}}' }),
    }).then((r) => r.json())).data.posts).toBeDefined();

    await execa('node', [fileURLToPath(new URL('./reset.mjs', import.meta.url))], {
      env: { GOLDEN_FIXTURE_URL: url },
    });
    // After reset, a previously-created user is gone.
    const u = await post('/graphql', {
      query: 'mutation($e:String!){createUser(email:$e){id}}',
      variables: { e: 'd@example.com' },
    });
    const id = u.body.data.createUser.id;
    await execa('node', [fileURLToPath(new URL('./reset.mjs', import.meta.url))], {
      env: { GOLDEN_FIXTURE_URL: url },
    });
    const gone = await fetch(`${url}/api/users/${id}`);
    expect(gone.status).toBe(404);
  });
});
