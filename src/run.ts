import type { Config } from './config/schema.js';
import type { Golden } from './spec/types.js';
import { parseGolden } from './spec/parse.js';
import { runScenario } from './engine/runner.js';
import { compareBody, Bindings, type Mismatch } from './golden/compare.js';
import { effectiveIgnorePaths } from './golden/normalize.js';
import type { SentRequest } from './transport/index.js';

export interface StepResult {
  index: number;
  name: string;
  request: SentRequest;
  statusMismatch?: { expected: number; actual: number };
  mismatches: Mismatch[];
  ok: boolean;
  durationMs?: number;
}

export interface ScenarioResult {
  name: string;
  file: string;
  ok: boolean;
  steps: StepResult[];
  /** Set when the scenario could not complete (transport/capture error). */
  error?: { stepIndex: number; stepName: string; message: string };
  /** Set when the golden's specHash no longer matches the current spec (§12). */
  drift?: { expected: string; actual: string };
}

export interface RunSummary {
  results: ScenarioResult[];
  passed: number;
  failed: number;
  ok: boolean;
}

export interface RunOptions {
  forceNoReset?: boolean;
  /** Only run scenarios whose name includes this substring. */
  filter?: string;
  /** Stop after the first failing scenario. */
  bail?: boolean;
  /** Current spec hashes by scenario name, for drift detection. */
  specHashes?: Map<string, string>;
  /** Treat spec drift as a failure (default: warn only). */
  strict?: boolean;
  /** Called as each scenario completes (enables streaming output). */
  onScenarioResult?: (result: ScenarioResult) => void;
  /** Called immediately before a DB reset runs. */
  onReset?: () => void;
}

/** Run a single golden scenario against the live API and compare every step. */
export async function runGoldenScenario(
  golden: Golden,
  file: string,
  config: Config,
  opts: RunOptions = {},
  skipReset = false,
): Promise<ScenarioResult> {
  const run = await runScenario(golden.steps, config, {
    forceNoReset: opts.forceNoReset,
    skipReset,
    onReset: opts.onReset,
  });

  const matchers = [...config.normalize.matchers, ...(golden.matchers ?? [])];
  const ignorePaths = effectiveIgnorePaths(config.normalize.ignorePaths, golden.ignores);
  const bindings = new Bindings();

  const steps: StepResult[] = run.executions.map((exec) => {
    const goldenStep = golden.steps[exec.index]!;
    const mismatches = compareBody(goldenStep.response.body, exec.response.body, {
      matchers,
      ignorePaths,
      bindings,
    });
    const statusMismatch =
      goldenStep.response.status !== exec.response.status
        ? { expected: goldenStep.response.status, actual: exec.response.status }
        : undefined;
    return {
      index: exec.index,
      name: goldenStep.name,
      request: exec.request,
      statusMismatch,
      mismatches,
      ok: !statusMismatch && mismatches.length === 0,
      durationMs: exec.durationMs,
    };
  });

  const currentHash = opts.specHashes?.get(golden.name);
  const drift =
    golden.specHash && currentHash && golden.specHash !== currentHash
      ? { expected: golden.specHash, actual: currentHash }
      : undefined;

  const ok = !run.error && steps.every((s) => s.ok) && !(drift && opts.strict);
  return { name: golden.name, file, ok, steps, error: run.error, drift };
}

/** Run a set of golden files and aggregate the results. */
export async function runGoldens(
  files: string[],
  config: Config,
  opts: RunOptions = {},
): Promise<RunSummary> {
  // Parse + filter upfront so we can size the pool and select scenarios.
  const loaded: { file: string; golden: Golden }[] = [];
  for (const file of files) {
    const golden = await parseGolden(file);
    if (opts.filter && !golden.name.includes(opts.filter)) continue;
    loaded.push({ file, golden });
  }

  // Sequential — supports --bail and the `pure` reset optimization: a reset
  // is skipped when the preceding scenario was pure (it left the DB clean).
  const results: ScenarioResult[] = [];
  let skipNextReset = false;
  for (const { file, golden } of loaded) {
    const result = await runGoldenScenario(golden, file, config, opts, skipNextReset);
    results.push(result);
    opts.onScenarioResult?.(result);
    skipNextReset = golden.pure === true;
    if (opts.bail && !result.ok) break;
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  return { results, passed, failed, ok: failed === 0 };
}
