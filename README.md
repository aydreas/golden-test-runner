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
- **`pure: true`** — marks a scenario that only *reads* and never modifies the
  database. The DB reset before the **next** scenario is then skipped (a pure
  scenario leaves the DB clean), which speeds up suites with read-only flows. A
  scenario after a non-pure one still resets, so every scenario sees clean
  state. `golden import` sets `pure` automatically when a recording contains
  only `GET`/`HEAD` requests and GraphQL queries (no mutations).

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

Replays golden(s) against the live API and diffs responses. Scenarios are
printed as they complete. Each step shows its duration.
A `↺ resetting database` notice appears on stderr before each DB reset.
Exits non-zero on any failure.

| Flag | Description |
|------|-------------|
| `-f, --file <glob>` | golden file or glob (default: `goldenDir/**/*.golden.yaml`) |
| `-c, --config <path>` | config file path |
| `--no-reset` | skip the DB reset hook |
| `--bail` | stop on the first failing scenario |
| `--filter <name>` | only run scenarios whose name includes this substring |
| `--reporter <kind>` | `pretty` (default), `json`, or `junit` |
| `--strict` | fail (not just warn) when a golden is out of date vs its spec |

Example failure report:

```
✗ user-signup-and-first-post   (tests/__golden__/user-signup-and-first-post.golden.yaml)
  ✓ 1 create-user (34ms)
  ✗ 2 create-post (21ms)   GraphQL CreatePost
        data.createPost.status   expected "draft", got "published"
  ✓ 3 login-rest (18ms)

1 scenario, 0 passed, 1 failed (1 field mismatch)
```

### `golden import`

Converts a browser-recorded **HAR** into a draft spec, so you can author specs
by *using the app* instead of hand-writing YAML. Open DevTools → Network, play
out one scenario, *Save all as HAR*, then:

```bash
golden import --har recording.har --name signup
```

It filters to your `baseUrl` (dropping static assets, analytics, `OPTIONS`
preflights and poll duplicates), classifies REST vs GraphQL, and **auto-detects
chaining** — when a value from an earlier response reappears in a later request
(a created `id`, a login `token`), it adds a `capture:` to the producing step
and rewrites the consumer to `{{var}}`. The detection is heuristic, so the
output is a **draft** to review before `generate`.

| Flag | Description |
|------|-------------|
| `--har <file>` | HAR file exported from the browser (required) |
| `--name <scenario>` | scenario name (default: HAR filename) |
| `-o, --out <path>` | output spec path (default: `<name>.spec.yaml`) |
| `-c, --config <path>` | config file path |
| `--dry-run` | print the spec without writing it |

Allow/deny lists (`import.include` / `import.exclude`, matched against the URL
path) further narrow what's kept.

## Editor support (autocomplete & validation)

JSON Schemas for the config, spec, and golden files are generated from the same
zod definitions used at runtime (so they never drift) and live in `schemas/`.
Regenerate them after changing the schemas:

```bash
npm run gen:schema
```

- **WebStorm / IntelliJ** — already wired via `.idea/jsonSchemas.xml`: open any
  `*.spec.yaml`, `*.golden.yaml`, or `goldentest.config.yaml` and you get field
  completion, type checking, and hover docs. (Otherwise: *Settings → Languages &
  Frameworks → Schemas and DSLs → JSON Schema Mappings* → add `schemas/*.schema.json`
  with file patterns `*.spec.yaml` etc.)
- **VS Code** — install the YAML extension (`redhat.vscode-yaml`) and map the
  schemas in `settings.json`:

  ```json
  "yaml.schemas": {
    "./schemas/spec.schema.json": "*.spec.yaml",
    "./schemas/golden.schema.json": "*.golden.yaml",
    "./schemas/config.schema.json": "goldentest.config.{yaml,yml}"
  }
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
