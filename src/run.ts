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
}

export interface ScenarioResult {
  name: string;
  file: string;
  ok: boolean;
  steps: StepResult[];
  /** Set when the scenario could not complete (transport/capture error). */
  error?: { stepIndex: number; stepName: string; message: string };
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
}

/** Run a single golden scenario against the live API and compare every step. */
export async function runGoldenScenario(
  golden: Golden,
  file: string,
  config: Config,
  opts: RunOptions = {},
): Promise<ScenarioResult> {
  const run = await runScenario(golden.steps, config, {
    forceNoReset: opts.forceNoReset,
    scenarioConfig: golden.config,
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
    };
  });

  const ok = !run.error && steps.every((s) => s.ok);
  return { name: golden.name, file, ok, steps, error: run.error };
}

/** Run a set of golden files and aggregate the results. */
export async function runGoldens(
  files: string[],
  config: Config,
  opts: RunOptions = {},
): Promise<RunSummary> {
  const results: ScenarioResult[] = [];

  for (const file of files) {
    const golden = await parseGolden(file);
    if (opts.filter && !golden.name.includes(opts.filter)) continue;

    const result = await runGoldenScenario(golden, file, config, opts);
    results.push(result);
    if (opts.bail && !result.ok) break;
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  return { results, passed, failed, ok: failed === 0 };
}
