/**
 * Programmatic API for golden-test-runner.
 *
 *   import { generate, run } from 'golden-test-runner';
 */
export { loadConfig, validateConfig, ConfigError } from './config/load.js';
export type { Config } from './config/schema.js';
export * from './spec/types.js';

export { generate, buildGolden, GenerateError } from './golden/generate.js';
export type { GenerateOptions, GenerateResult } from './golden/generate.js';

export { runGoldens as run, runGoldenScenario } from './run.js';
export type { RunOptions, RunSummary, ScenarioResult, StepResult } from './run.js';

export { compareBody, Bindings } from './golden/compare.js';
export type { Mismatch, MismatchKind } from './golden/compare.js';

export { render } from './report/index.js';
export type { ReporterKind } from './report/index.js';

export { parseSpec, parseGolden, hashSpec } from './spec/parse.js';
export { discover } from './spec/discover.js';
