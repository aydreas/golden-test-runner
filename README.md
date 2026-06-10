# golden-test-runner

An end-to-end test runner for **REST and GraphQL** APIs that works on **golden
samples**. You hand-write small **spec** files (a chain of requests); `generate`
hits your *real* API and records **golden** files; `run` replays them against a
live server and diffs the responses — resetting the database between scenarios.

It fills a gap no single off-the-shelf tool covers: chained spec → record golden
(with captured placeholders + normalized volatile fields) → replay and diff,
with per-scenario DB reset.

```
spec.yaml ──generate──▶ *.golden.yaml ──run──▶ pass/fail + field-level diff
```

## Install

```bash
npm install --save-dev golden-test-runner
```

Requires Node 20+. Exposes a `golden` CLI and a programmatic API.

## Quick start

1. Write a config (`goldentest.config.yaml`):

   ```yaml
   baseUrl: http://localhost:8000
   graphql:
     path: /graphql
   reset:
     enabled: true
     command: npm run db:reset
   normalize:
     ignorePaths:
       - "$..createdAt"
     matchers:
       - { path: "$..id", type: uuid }
   paths:
     specs: tests/**/*.spec.yaml
     goldenDir: tests/__golden__
   ```

2. Write a spec (`tests/signup.spec.yaml`):

   ```yaml
   name: user-signup-and-first-post
   config: { reset: true }
   steps:
     - name: create-user
       graphql:
         query: |
           mutation CreateUser($email: String!) {
             createUser(email: $email) { id email createdAt }
           }
         variables: { email: alice@example.com }
       capture:
         userId: "$.data.createUser.id"

     - name: create-post
       graphql:
         query: |
           mutation CreatePost($author: ID!, $title: String!) {
             createPost(authorId: $author, title: $title) { id title author { id } }
           }
         variables: { author: "{{userId}}", title: Hello World }
   ```

3. Record goldens, then run them:

   ```bash
   golden generate            # records tests/__golden__/*.golden.yaml
   golden run                 # replays + diffs against the live server
   ```

## Concepts

- **Spec** — hand-written, no responses: a name + ordered `steps`, each a
  `rest:` *or* `graphql:` request, with optional `capture:` declarations.
- **Capture** — `capture: { userId: "$.data.createUser.id" }` binds a JSONPath
  from a step's response to a `{{userId}}` placeholder usable in later steps
  (in any string: path, headers, body, variables).
- **Golden** — generated; the spec's steps **plus recorded responses**, where
  captured values appear symbolically as `{{name}}` and volatile fields are
  replaced with the `<<ignore>>` sentinel so goldens are stable in git.

### How volatile / dynamic values are handled

- **`{{name}}` placeholders** — consistency wildcards. The first occurrence in a
  scenario binds to the live value; later occurrences must equal it. This is why
  ids that differ on a fresh database still pass, as long as the chaining is
  internally consistent.
- **`normalize.ignorePaths`** — JSONPaths dropped from comparison; stored as
  `<<ignore>>` in the golden (applied at generate time, so goldens don't churn).
- **`normalize.matchers`** — type/shape checks applied at compare time:
  `uuid | any | regex | number | iso-date`. The golden keeps a representative
  recorded value; the comparator type-checks the live value at those paths.
- **Per-scenario `ignores:`** — JSONPaths ignored for one scenario only, merged
  with the global `ignorePaths`.

Everything else is compared by **exact deep equality**. Missing keys, extra
keys, type mismatches and array-length differences are all reported.

## Commands

### `golden generate`

Runs spec(s) against the live API and records goldens.

| Flag | Description |
|------|-------------|
| `-f, --file <glob>` | spec file or glob (default: `paths.specs`) |
| `-o, --out <dir>` | output dir (default: `paths.goldenDir`) |
| `-c, --config <path>` | config file path |
| `--no-reset` | skip the DB reset hook |
| `--update` | regenerate existing goldens |

### `golden run`

Replays golden(s) against the live API and diffs responses. Exits non-zero on
any failure.

| Flag | Description |
|------|-------------|
| `-f, --file <glob>` | golden file or glob (default: `goldenDir/**/*.golden.yaml`) |
| `-c, --config <path>` | config file path |
| `--no-reset` | skip the DB reset hook |
| `--bail` | stop on the first failing scenario (implies sequential) |
| `--filter <name>` | only run scenarios whose name includes this substring |
| `--concurrency <n>` | run N scenarios in parallel (see caveat) |
| `--reporter <kind>` | `pretty` (default), `json`, or `junit` |
| `--strict` | fail (not just warn) when a golden is out of date vs its spec |

> **Concurrency caveat:** scenarios share one database. Running them in parallel
> while per-scenario reset is enabled will let them interfere. Use
> `--concurrency` only with `--no-reset` or an isolated/per-scenario database.

Example failure report:

```
✗ user-signup-and-first-post   (tests/__golden__/user-signup-and-first-post.golden.yaml)
  ✓ 1 create-user
  ✗ 2 create-post   GraphQL CreatePost
        data.createPost.status   expected "draft", got "published"
  ✓ 3 login-rest

1 scenario, 0 passed, 1 failed (1 field mismatch)
```

## Programmatic API

```ts
import { loadConfig, generate, run, render } from 'golden-test-runner';

const { config } = await loadConfig();
await generate('tests/signup.spec.yaml', config);
const summary = await run(['tests/__golden__/signup.golden.yaml'], config);
console.log(render('pretty', summary));
process.exitCode = summary.ok ? 0 : 1;
```

## Trying the example

This repo ships a tiny fixture API (REST + GraphQL) you can run against:

```bash
npm run build
PORT=8000 node test/fixture/api.mjs &        # start the fixture
export GOLDEN_FIXTURE_URL=http://127.0.0.1:8000
node dist/cli.js generate --config examples/goldentest.config.yaml --file examples/signup.spec.yaml
node dist/cli.js run --config examples/goldentest.config.yaml
```

## License

MIT
