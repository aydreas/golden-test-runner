import type { Config } from '../config/schema.js';
import type { SpecStep, GoldenStep } from '../spec/types.js';
import { Context } from './context.js';
import { applyCaptures } from './capture.js';
import { runReset, resetEnabled } from './reset.js';
import { executeStep, type SentRequest, type TransportResponse } from '../transport/index.js';

export interface StepExecution {
  index: number;
  step: SpecStep | GoldenStep;
  request: SentRequest;
  response: TransportResponse;
}

export interface ScenarioRun {
  context: Context;
  executions: StepExecution[];
  /** Set when a step threw (transport/interpolation/capture); the loop stops there. */
  error?: { stepIndex: number; stepName: string; message: string };
}

export interface RunScenarioOptions {
  /** CLI --no-reset. */
  forceNoReset?: boolean;
  /**
   * Skip the reset for this scenario because the preceding scenario was `pure`
   * (left the DB clean). Decided by the orchestrator, which knows the ordering.
   */
  skipReset?: boolean;
}

/**
 * The shared execution engine (§2): reset → fresh context → for each step
 * interpolate + send + capture. Returns the raw execution trace; `generate`
 * and `run` diverge only afterwards (record vs compare).
 */
export async function runScenario(
  steps: (SpecStep | GoldenStep)[],
  config: Config,
  opts: RunScenarioOptions = {},
): Promise<ScenarioRun> {
  if (!opts.skipReset && resetEnabled(config, opts.forceNoReset ?? false)) {
    await runReset(config);
  }

  const context = new Context();
  const executions: StepExecution[] = [];

  for (let index = 0; index < steps.length; index++) {
    const step = steps[index]!;
    try {
      const { request, response } = await executeStep(step, config, context);
      executions.push({ index, step, request, response });
      applyCaptures(step.capture, response.body, context);
    } catch (err) {
      return {
        context,
        executions,
        error: { stepIndex: index, stepName: step.name, message: String((err as Error).message) },
      };
    }
  }

  return { context, executions };
}
