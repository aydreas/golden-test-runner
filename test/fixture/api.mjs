// Tiny throwaway fixture API used to self-test the harness.
// Exposes BOTH a REST surface and a GraphQL endpoint on one server, holds
// stateful CRUD in memory, emits volatile fields (uuid ids + timestamps),
// supports value chaining (created id / login token reused later), and can be
// reset out-of-band via POST /__reset__ so the shell reset hook is testable.
import { createServer as createHttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { buildSchema, graphql } from 'graphql';

const schema = buildSchema(`
  type User { id: ID!, email: String!, createdAt: String! }
  type Post { id: ID!, title: String!, status: String!, author: User! }
  type Query {
    user(id: ID!): User
    posts: [Post!]!
  }
  type Mutation {
    createUser(email: String!): User!
    createPost(authorId: ID!, title: String!): Post!
  }
`);

function nowIso() {
  return new Date().toISOString();
}

function createStore() {
  const users = new Map();
  const posts = new Map();

  function createUser(email) {
    const user = { id: randomUUID(), email, createdAt: nowIso() };
    users.set(user.id, user);
    return user;
  }
  function createPost(authorId, title) {
    const author = users.get(authorId);
    if (!author) throw new Error(`unknown author: ${authorId}`);
    const post = { id: randomUUID(), title, status: 'draft', author };
    posts.set(post.id, post);
    return post;
  }

  return {
    users,
    posts,
    createUser,
    createPost,
    reset() {
      users.clear();
      posts.clear();
    },
  };
}

function rootValue(store) {
  return {
    user: ({ id }) => store.users.get(id) ?? null,
    posts: () => [...store.posts.values()],
    createUser: ({ email }) => store.createUser(email),
    createPost: ({ authorId, title }) => store.createPost(authorId, title),
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, payload) {
  const json = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(json);
}

/** Create the fixture server (not yet listening). */
export function createServer() {
  const store = createStore();

  const server = createHttpServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    const method = req.method ?? 'GET';

    try {
      // Out-of-band reset (exercised by the shell reset hook).
      if (path === '/__reset__' && method === 'POST') {
        store.reset();
        return send(res, 200, { ok: true });
      }

      // GraphQL endpoint.
      if (path === '/graphql' && method === 'POST') {
        const raw = await readBody(req);
        const { query, variables, operationName } = JSON.parse(raw || '{}');
        const result = await graphql({
          schema,
          source: query,
          rootValue: rootValue(store),
          variableValues: variables,
          operationName,
        });
        return send(res, 200, result);
      }

      // REST: login → returns a chainable token + a volatile timestamp.
      if (path === '/api/login' && method === 'POST') {
        const raw = await readBody(req);
        const { email } = JSON.parse(raw || '{}');
        return send(res, 200, { token: randomUUID(), email, issuedAt: nowIso() });
      }

      // REST: create user.
      if (path === '/api/users' && method === 'POST') {
        const raw = await readBody(req);
        const { email } = JSON.parse(raw || '{}');
        if (!email) return send(res, 400, { error: 'email required' });
        return send(res, 201, store.createUser(email));
      }

      // REST: fetch user by id.
      const userMatch = path.match(/^\/api\/users\/([^/]+)$/);
      if (userMatch && method === 'GET') {
        const user = store.users.get(userMatch[1]);
        return user ? send(res, 200, user) : send(res, 404, { error: 'not found' });
      }

      return send(res, 404, { error: `no route for ${method} ${path}` });
    } catch (err) {
      return send(res, 500, { error: String(err?.message ?? err) });
    }
  });

  return { server, store };
}

/** Start listening. Returns { server, store, url, close }. */
export function start(port = 0) {
  const { server, store } = createServer();
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      const url = `http://127.0.0.1:${addr.port}`;
      resolve({
        server,
        store,
        url,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

// Allow running directly for manual play: `node test/fixture/api.mjs`
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8000);
  start(port).then(({ url }) => {
    console.log(`fixture API listening on ${url}`);
  });
}
