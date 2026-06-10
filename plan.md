# Golden Test Runner — Plan

An e2e test runner, distributed as an NPM package, that works on **golden samples**
and supports both **REST** and **GraphQL**. Two commands — `generate` and `run` —
operate on two file types: hand-written **spec** files and generated **golden
scenario** files. The harness is generic so any HTTP API can adopt it.

---

## 1. Does something already do this?

I researched the space before deciding to build. Conclusion: **no single tool does
this exact workflow**, but several solve *parts* of it and we should reuse them.

| Tool | What it does | Why it's not enough |
|------|--------------|---------------------|
| **Hurl** (`hurl.dev`) | Plain-text chained HTTP requests, capture values from responses (`[Captures]`), assert on later ones. REST + GraphQL. | *Assertion-based*: you hand-write expected values inline. No "record the real response as a golden, then diff" workflow. It's a Rust binary (npm wrapper only downloads it), not a library. |
| **StepCI** (`stepci`) | YAML workflows, REST/GraphQL/gRPC, capture + checks. npm package. | Also assertion-based — you author expectations. No golden generate-then-diff. Project is largely stagnant. |
| **VCR / node-replay / yakbak / node-recorder** | Record & replay HTTP interactions. | Built to **mock a server** (replay recordings *instead of* calling it) — the opposite of validating a *live* server against goldens. |
| **Jest snapshots / ApprovalTests** | Golden-master compare with diffs. | No HTTP orchestration, no response→variable chaining, no DB reset, no REST/GraphQL transport. |

**The gap:** chained, hand-written spec → `generate` hits the *real* API and records
golden scenario files (with captured placeholders + normalized volatile fields) →
`run` replays and diffs against goldens, resetting the DB between scenarios. That
specific combination is not off-the-shelf.

**Decision: build it, but reuse libraries for the solved parts** (HTTP, JSONPath,
YAML, diff rendering). See §3 for the tech list.

### 1a. "Just generate files for Hurl/StepCI instead?" (the build-vs-delegate fork)

A tempting alternative: build **only the generator**, emitting Hurl or StepCI files
(with assertions baked from the recorded responses), and let those tools do `run`.

I evaluated this and recommend **against making it the primary architecture**, for
these reasons:

- **The generator is the hard half — you build it either way.** Chained live calls,
  JSONPath capture, placeholder *symbolization*, and normalization (§5) are all ours
  regardless. The run/compare engine we'd be "saving" is comparatively small.
- **Their assertion model is lossy for our semantics.** Our golden is a *whole-tree
  equality with wildcard placeholders + configurable ignore/normalize rules*
  (§6–§7). Hurl/StepCI express per-field asserts. Translating produces verbose,
  brittle assert lists and loses the clean tree-diff.
- **Error-message quality is the #1 stated requirement** ("which scenario, which
  query, what didn't match"). Owning the comparator gives the best diffs. Delegating
  means parsing *their* output to re-format it — comparable effort, worse UX.
- **External binary / version drift.** Hurl is a Rust binary; per-scenario DB-reset
  sequencing and exit-code handling are easier when we own the loop.

**Decision: own the runner, do not delegate to Hurl/StepCI.** We build both
`generate` and `run` ourselves. No export/interop targets — that's scope we don't
need and would only complicate the tool.

---

## 2. High-level architecture

```
              ┌─────────────────────────── shared engine ───────────────────────────┐
  spec.yaml ─▶│ parse → resolve config → [reset DB] → for each step:                  │
              │   interpolate request (context vars) → send (REST|GraphQL) → capture  │
              └──────────────────────────────────────────────────────────────────────┘
                        │                                              │
            generate ───┘                                              └─── run
                        ▼                                              ▼
        record responses → symbolize captured             compare live response vs golden
        values → normalize volatile fields                (placeholder = consistency wildcard,
        → write  *.golden.yaml                            ignore/normalize rules applied)
                                                          → field-level diff report → exit code
```

Both commands share one execution engine. They differ only at the tail: `generate`
**records & writes**, `run` **compares & reports**.

---

## 3. Technology choices

- **Language:** TypeScript, compiled to JS. Published with a `bin` entry +
  programmatic API (`import { generate, run } from 'golden-test-runner'`).
- **Runtime:** Node 20+ (uses native `fetch`/`undici`).
- **CLI:** `commander` (small, well-known) — subcommands `generate` and `run`.
- **YAML:** `yaml` (eemeli) — preserves comments, good multi-line scalars for queries.
- **HTTP:** native `fetch` (undici) — no heavy client needed.
- **JSONPath:** `jsonpath-plus` — for captures, ignore paths, and matchers.
- **Diff rendering:** `jest-diff` for human-readable colored diffs; our own
  structural comparator drives *what* counts as a mismatch.
- **Config load:** `cosmiconfig` (finds `goldentest.config.{js,ts,yaml,json}`).
- **Validation:** `zod` — validate config + parsed specs, with clear errors.
- **Shell reset:** `execa` — run the configured DB-reset command.
- **GraphQL:** sent as plain `POST {query, variables}`; optional `graphql` package
  only if we later want query validation. Not required for MVP.
- **Globbing:** `tinyglobby` / `fast-glob` to resolve spec & golden file sets.
- **Tests (of the harness itself):** `vitest` against a tiny throwaway fixture API.

---

## 4. File formats

### 4.1 Config — `goldentest.config.yaml`

```yaml
baseUrl: http://localhost:8000
graphql:
  path: /graphql            # endpoint for GraphQL steps

reset:
  enabled: true             # global default; per-scenario override allowed
  command: "npm run db:reset"
  cwd: ../api               # optional
  timeoutMs: 30000

defaults:
  headers:                  # applied to every request; supports placeholders
    Authorization: "Bearer {{token}}"
  timeoutMs: 10000

normalize:                  # how `run` treats volatile / dynamic values (§7)
  ignorePaths:
    - "$..createdAt"
    - "$..updatedAt"
  matchers:
    - { path: "$..id",    type: uuid }   # any uuid matches any uuid
    - { path: "$..token", type: any }    # present, any value

paths:
  specs: "tests/**/*.spec.yaml"
  goldenDir: "tests/__golden__"          # where generated goldens are written
```

Everything is overridable via CLI flags; config is the convenient default.

### 4.2 Spec file (hand-written) — `tests/signup.spec.yaml`

Optimized to be **as easy as possible to write**: a name, an ordered list of steps,
each step a request, plus optional `capture` declarations. No responses. Specs can be
hand-written **or** generated from recorded browser traffic via `golden import` (§13).

```yaml
name: user-signup-and-first-post
description: Sign up a user, then create a post as that user.

config:                     # optional per-scenario overrides
  reset: true

ignores:                    # per-scenario ignore paths, merged with config.normalize.ignorePaths (§7)
  - "$..lastSeenAt"

steps:
  - name: create-user
    graphql:                # GraphQL step
      query: |
        mutation CreateUser($email: String!) {
          createUser(email: $email) { id email createdAt }
        }
      variables:
        email: alice@example.com
    capture:
      userId: "$.data.createUser.id"     # JSONPath → placeholder {{userId}}

  - name: create-post
    graphql:
      query: |
        mutation CreatePost($author: ID!, $title: String!) {
          createPost(authorId: $author, title: $title) {
            id title status author { id }
          }
        }
      variables:
        author: "{{userId}}"             # reuse captured value
        title: Hello World

  - name: login-rest                     # REST step (same scenario can mix)
    rest:
      method: POST
      path: /api/login
      headers: { Content-Type: application/json }
      body: { email: alice@example.com, password: secret }
    capture:
      token: "$.token"
```

Rules:
- A step is **either** `graphql:` **or** `rest:` (validated by zod).
- `{{name}}` placeholders interpolate captured values into any string in later steps
  (path, headers, body, variables).
- `capture:` maps a placeholder name → JSONPath into that step's response.
- `ignores:` (scenario level) lists JSONPaths to ignore on compare for this scenario
  only; merged with the global `normalize.ignorePaths` (§7).

### 4.3 Golden scenario file (generated) — `tests/__golden__/user-signup-and-first-post.golden.yaml`

Same steps **plus recorded responses**. Captured values appear **symbolically** as
`{{name}}` (so they're wildcards on replay); volatile fields are replaced with a
**normalize sentinel** so the golden is stable in git across regenerations.

```yaml
name: user-signup-and-first-post
specHash: "sha256:…"          # detect spec drift vs golden
generatedAt: "2026-06-10T…"

steps:
  - name: create-user
    graphql:
      query: |
        mutation CreateUser($email: String!) { createUser(email: $email) { id email createdAt } }
      variables: { email: alice@example.com }
    capture: { userId: "$.data.createUser.id" }
    response:
      status: 200
      body:
        data:
          createUser:
            id: "{{userId}}"               # captured → symbolic wildcard
            email: alice@example.com
            createdAt: "<<ignore>>"        # normalized volatile field

  - name: create-post
    graphql:
      query: | …
      variables: { author: "{{userId}}", title: Hello World }
    response:
      status: 200
      body:
        data:
          createPost:
            id: "{{__auto_1}}"             # auto-symbolized (matched §7 rule)
            title: Hello World
            status: draft
            author: { id: "{{userId}}" }  # same placeholder ⇒ must be consistent

  - name: login-rest
    rest: { method: POST, path: /api/login, … }
    capture: { token: "$.token" }
    response:
      status: 200
      body: { token: "{{token}}" }
```

---

## 5. `generate --file <spec>` flow

1. Load + validate config.
2. Resolve target spec(s): `--file` (single file or glob) or `paths.specs`.
3. For each scenario, in isolation:
   a. If reset enabled → run `reset.command` via `execa`.
   b. New empty **variable context**.
   c. For each step in order:
      - Interpolate `{{vars}}` in request from context.
      - Send (REST or GraphQL transport).
      - Apply `capture` JSONPaths → store **concrete** values in context.
      - Keep the **raw** response.
4. **Symbolize:** for every captured concrete value, textually/structurally replace
   its occurrences with `{{name}}` across all recorded payloads in the scenario
   (the VCR "sensitive-data placeholder" trick). Values matched by `normalize.matchers`
   that weren't explicitly captured get an auto placeholder (`{{__auto_N}}`).
5. **Normalize:** replace `normalize.ignorePaths` matches with `<<ignore>>` sentinel.
6. Write `*.golden.yaml` to `paths.goldenDir`, recording `specHash` + `generatedAt`.

Flags: `--file`, `--out`, `--no-reset`, `--config`, `--update` (regenerate existing).

---

## 6. `run --file <golden>` flow

1. Load + validate config; load target golden(s).
2. (Optional) compare `specHash` against the current spec → warn on drift.
3. For each scenario, in isolation:
   a. Reset DB if enabled.
   b. New empty variable context.
   c. For each step:
      - Interpolate request placeholders from context (values bound from **live**
        earlier responses — chaining works on fresh data).
      - Send.
      - **Compare** live response against the golden response (§6.1).
      - On the live response, bind capture placeholders from the live value.
   d. Collect per-step mismatches.
4. **Report** (§9) and exit non-zero if any scenario failed.

Flags: `--file`, `--config`, `--no-reset`, `--bail`, `--filter <name>`,
`--concurrency <n>` (scenarios are independent), `--reporter <pretty|json|junit>`.

### 6.1 The comparator (core of the value)

Walk golden and live response trees together:
- **Placeholder `{{name}}`** in golden = wildcard with a **consistency constraint**.
  First occurrence binds `name := live value`; later occurrences must equal the bound
  value. (This is why captured IDs that differ on a fresh DB still pass — as long as
  they're internally consistent and chained correctly.)
- **`<<ignore>>` sentinel** = skip this field entirely.
- **Matcher path** (uuid/any/regex/number/iso-date) = type/shape check, not equality.
- **Everything else** = exact deep equality.
- Missing/extra keys and type mismatches are reported.

---

## 7. Handling volatile values (you chose: configurable ignore/normalize rules)

Two complementary mechanisms:
- **Capture placeholders** (`capture:` in the spec) — explicit, used for chaining;
  become consistency wildcards in the golden.
- **`normalize` rules** (config, global) — for values you *don't* chain but that vary
  run to run: `ignorePaths` (dropped from comparison, stored as `<<ignore>>`) and
  `matchers` (`type: uuid|any|regex|number|iso-date`, applied by JSONPath).
- **Per-scenario `ignores:`** (spec, §4.2) — JSONPaths to ignore for *that* scenario
  only, merged with the global `ignorePaths`. Keeps one-off volatile fields out of the
  global config. (Chosen over the "declare an unused variable" trick — an explicit
  `ignores` keyword is clearer and self-documenting.)

Default = **exact match**; rules opt fields out. Ignored paths are normalized **at
generate time** (sentinel) so goldens don't churn in git; matchers are applied **at
compare time** so the golden still shows a representative recorded value.

---

## 8. Generic / extensible design

- **Transport interface** — `send(request, ctx) → {status, headers, body}`. REST and
  GraphQL are two implementations; gRPC/SOAP can be added later without touching the
  engine.
- **Reset hook** — a shell command today (your choice). The interface allows a future
  JS-function or HTTP-endpoint hook with zero engine changes.
- **No stack-specific defaults** (your choice: keep generic). Auth is just a
  placeholder-driven header in `defaults.headers`, e.g. `Bearer {{token}}` captured by
  a login step. Works for any API.
- **Reporters** are pluggable (pretty / json / junit for CI).

---

## 9. Error reporting (the headline feature)

Per the requirement — show *which scenario*, *which step/query*, and *exactly what
didn't match*:

```
✗ user-signup-and-first-post   (tests/signup.spec.yaml)
  ✓ 1 create-user
  ✗ 2 create-post   GraphQL mutation CreatePost
        data.createPost.title    expected "Hello World"   actual "Hello Wrld"
        data.createPost.status   expected "draft"         actual "published"
  ✓ 3 login-rest

2 scenarios, 1 passed, 1 failed (1 step, 2 field mismatches)
```

Includes the request that was sent (method/endpoint/variables) and a `jest-diff`
block for large structural diffs. `--reporter json|junit` for CI.

---

## 10. Repository / module layout

```
src/
  cli.ts                 # commander: generate, run, import
  index.ts               # programmatic API
  config/{load,schema}.ts
  spec/{parse,types}.ts
  transport/{index,rest,graphql}.ts
  engine/{runner,context,capture,reset}.ts
  golden/{generate,compare,normalize,serialize}.ts
  import/{har,detect-chaining}.ts   # HAR → spec (§13)
  report/{pretty,json,junit}.ts
test/                    # vitest + a tiny fixture API (REST+GraphQL) to self-test
examples/                # sample config, spec, golden
```

---

## 11. Milestones

1. **M0 – Skeleton:** package scaffold, CLI stubs, config loader + zod schema, fixture API.
2. **M1 – Engine:** spec parse, transports, context/interpolation, capture, reset hook.
3. **M2 – generate:** record → symbolize → normalize → write golden. Round-trips on fixture.
4. **M3 – run + comparator:** placeholder/ignore/matcher comparison + pretty reporter.
5. **M4 – Polish:** json/junit reporters, concurrency, `--filter`/`--bail`, spec-drift warning, docs.
6. **M5 – HAR import:** `golden import` — filter, parse REST/GraphQL, auto-detect
   chaining, emit draft spec (§13). Can land any time after M1.

---

## 12. Open questions / risks

- **Symbolization ambiguity:** a captured value (e.g. id `"42"`) could coincidentally
  appear in unrelated fields. Mitigation: prefer structural replacement at the exact
  captured JSONPath + known reuse sites over blind string replace; make blind replace
  opt-in.
- **Ordering of arrays / non-deterministic collections:** responses with unordered
  lists need a sort/match-by-key strategy. Likely a `normalize` option
  (`unordered: $..items`) in a later milestone.
- **Reset granularity:** shell command per scenario can be slow for big suites.
  Consider an opt-in "reset once per file" or transaction-based mode later.
- **Spec/golden drift:** `specHash` warns, but we should define whether `run` fails
  or just warns when the spec changed without regenerating.
- **Pagination/time-based data** that even normalize can't stabilize — document the
  expectation that the reset seed is deterministic.

---

## 13. Authoring specs from browser traffic (HAR import)

Goal: write specs with as little manual work as possible. Instead of hand-writing
YAML, **browse the app and convert the captured traffic into a spec.** This adds a
third command that feeds the existing pipeline:

```
browse app (DevTools open) → Save all as HAR → golden import → *.spec.yaml
   → review → golden generate → *.golden.yaml → golden run
```

### Capture (your choice: HAR export only)

No proxy, no extension, no extra dependency. In any browser: open DevTools → Network,
play out **one scenario**, then *Save all as HAR*. (Proxy tools like Charles /
Proxyman / mitmproxy export the same HAR format, so they work too.)

### `golden import --har <file> --name <scenario>`

One HAR = one scenario (your choice). Steps:

1. **Filter to the API.** Keep only requests matching `baseUrl` / `graphql.path`;
   drop static assets, analytics, `OPTIONS` preflights, and duplicate/poll noise.
   Allow/deny lists live in config (`import.include` / `import.exclude`).
2. **Parse each kept request** in timestamp order:
   - **GraphQL** — read `{query, operationName, variables}` from the POST body,
     classify query vs mutation, name the step from `operationName`.
   - **REST** — method, path, filtered headers, body.
3. **Auto-detect chaining (the big time-saver).** Scan each response body for values
   that reappear in a *later* request (path, headers, body, or GraphQL variables) —
   the common cases being a created `id` or a login `token`. Where found:
   - add a `capture:` JSONPath to the earlier (producing) step, and
   - rewrite the literal in the later (consuming) step to `{{var}}`.

   This wires up exactly the placeholder plumbing you'd otherwise type by hand.
   It's heuristic, so the output is a **draft** flagged for a quick review.
4. **Strip auth/volatile headers** (keep auth as a captured `{{token}}` flowing from
   the login step into `defaults.headers`, per §8).
5. **Write `<name>.spec.yaml`** — same hand-written format as §4.2, no responses.

Flags: `--har`, `--name`, `--out`, `--config`, `--dry-run` (print without writing).

### Notes / limits

- The importer's chaining detection is best-effort; the emitted spec is meant to be
  skimmed and lightly edited, not trusted blind. That review is far cheaper than
  authoring from scratch.
- Values that are equal by coincidence (e.g. a literal `1`) can produce spurious
  captures — same mitigation as §12: prefer structural matches, make aggressive
  string-replace opt-in, and keep short/ambiguous values out of capture detection.
- Scenario boundaries are explicit (one recording per scenario), so no segmentation
  guesswork.
