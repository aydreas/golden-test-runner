import { writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Config } from '../config/schema.js';
import type { Spec, Golden, GoldenStep } from '../spec/types.js';
import { parseSpec, hashSpec } from '../spec/parse.js';
import { runScenario } from '../engine/runner.js';
import { symbolize } from './symbolize.js';
import { applyIgnores, effectiveIgnorePaths } from './normalize.js';
import { serializeGolden } from './serialize.js';

export class GenerateError extends Error {}

export interface GenerateOptions {
  forceNoReset?: boolean;
  /** Output directory; defaults to config.paths.goldenDir. */
  outDir?: string;
  /** ISO timestamp to stamp into the golden (injected for determinism in tests). */
  now?: string;
  /** Overwrite an existing golden; without this, an existing golden is skipped. */
  update?: boolean;
}

export interface GenerateResult {
  golden?: Golden;
  outputPath: string;
  /** True when an existing golden was left untouched (no --update). */
  skipped: boolean;
}

/** Build the in-memory golden for a spec by running it against the live API. */
export async function buildGolden(
  spec: Spec,
  config: Config,
  opts: GenerateOptions = {},
): Promise<Golden> {
  const run = await runScenario(spec.steps, config, {
    forceNoReset: opts.forceNoReset,
    scenarioConfig: spec.config,
  });

  if (run.error) {
    throw new GenerateError(
      `scenario "${spec.name}" failed at step ${run.error.stepIndex + 1} ` +
        `(${run.error.stepName}): ${run.error.message}`,
    );
  }

  const bodies = spec.steps.map((_, i) => run.executions[i]?.response.body);

  const symbolized = symbolize({
    bodies,
    captures: spec.steps.map((s) => s.capture),
    captured: run.context.snapshot(),
  });

  const ignorePaths = effectiveIgnorePaths(config.normalize.ignorePaths, spec.ignores);
  applyIgnores(symbolized, ignorePaths);

  const steps: GoldenStep[] = spec.steps.map((step, i) => ({
    ...step,
    response: {
      status: run.executions[i]!.response.status,
      body: symbolized[i],
    },
  }));

  return {
    name: spec.name,
    specHash: hashSpec(spec),
    ...(opts.now ? { generatedAt: opts.now } : {}),
    ...(spec.config ? { config: spec.config } : {}),
    ...(spec.ignores ? { ignores: spec.ignores } : {}),
    ...(spec.matchers ? { matchers: spec.matchers } : {}),
    steps,
  };
}

/** Generate (and write) a golden file from a spec file. */
export async function generate(
  specFile: string,
  config: Config,
  opts: GenerateOptions = {},
): Promise<GenerateResult> {
  const spec = await parseSpec(specFile);
  const outDir = resolve(opts.outDir ?? config.paths.goldenDir);
  const outputPath = join(outDir, `${spec.name}.golden.yaml`);

  // Don't clobber an existing golden (or hit the API) unless --update.
  if (!opts.update && (await exists(outputPath))) {
    return { outputPath, skipped: true };
  }

  const golden = await buildGolden(spec, config, opts);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serializeGolden(golden), 'utf8');

  return { golden, outputPath, skipped: false };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
