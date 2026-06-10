import { describe, it, expect } from 'vitest';
import { ConfigSchema } from '../src/config/schema.js';
import { importHar } from '../src/import/index.js';

const config = ConfigSchema.parse({ baseUrl: 'http://localhost:8000', graphql: { path: '/graphql' } });

function entry(request: any, responseBody: unknown) {
  return {
    request,
    response: { content: { mimeType: 'application/json', text: JSON.stringify(responseBody) } },
  };
}

const har = {
  log: {
    entries: [
      entry(
        {
          method: 'POST',
          url: 'http://localhost:8000/graphql',
          headers: [{ name: 'content-type', value: 'application/json' }],
          postData: {
            mimeType: 'application/json',
            text: JSON.stringify({
              query: 'mutation CreateUser($email: String!) { createUser(email: $email) { id email } }',
              variables: { email: 'alice@example.com' },
            }),
          },
        },
        { data: { createUser: { id: 'uuid-AAA-1234', email: 'alice@example.com' } } },
      ),
      entry(
        {
          method: 'POST',
          url: 'http://localhost:8000/graphql',
          postData: {
            mimeType: 'application/json',
            text: JSON.stringify({
              query: 'mutation CreatePost($author: ID!) { createPost(authorId: $author) { id } }',
              variables: { author: 'uuid-AAA-1234' },
            }),
          },
        },
        { data: { createPost: { id: 'uuid-BBB-5678' } } },
      ),
      entry(
        {
          method: 'POST',
          url: 'http://localhost:8000/api/login',
          headers: [{ name: 'content-type', value: 'application/json' }],
          postData: { mimeType: 'application/json', text: JSON.stringify({ email: 'a', password: 'b' }) },
        },
        { token: 'tok-abcdefgh' },
      ),
      entry(
        {
          method: 'GET',
          url: 'http://localhost:8000/api/me',
          headers: [
            { name: 'authorization', value: 'Bearer tok-abcdefgh' },
            { name: 'user-agent', value: 'Mozilla/5.0' },
          ],
        },
        { ok: true },
      ),
      // noise that must be dropped:
      entry({ method: 'OPTIONS', url: 'http://localhost:8000/graphql' }, {}),
      entry({ method: 'GET', url: 'http://localhost:8000/static/app.js' }, {}),
      entry({ method: 'GET', url: 'https://analytics.example.com/collect' }, {}),
    ],
  },
};

describe('HAR import', () => {
  it('filters noise, classifies steps, and auto-detects chaining', () => {
    const { spec } = importHar(har, config, 'browsed-flow');

    expect(spec.steps).toHaveLength(4);

    // GraphQL operation naming + capture on the producer
    const createUser = spec.steps[0]!;
    expect(createUser.name).toBe('CreateUser');
    expect(createUser.capture).toEqual({ createUserId: '$.data.createUser.id' });

    // consumer literal rewritten to the placeholder
    expect(spec.steps[1]!.graphql!.variables!.author).toBe('{{createUserId}}');

    // REST login captures the token; later Authorization header rewritten (substring)
    const login = spec.steps[2]!;
    expect(login.capture).toEqual({ token: '$.token' });
    const me = spec.steps[3]!;
    expect(me.rest!.headers).toEqual({ authorization: 'Bearer {{token}}' });
    // volatile header stripped
    expect(JSON.stringify(me.rest)).not.toContain('Mozilla');
  });

  it('throws when nothing matches the baseUrl', () => {
    expect(() => importHar({ log: { entries: [] } }, config, 'empty')).toThrow();
  });
});
