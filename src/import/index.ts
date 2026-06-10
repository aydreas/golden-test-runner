import { stringify as stringifyYaml } from 'yaml';
import type { Config } from '../config/schema.js';
import { SpecSchema, type Spec, type SpecStep } from '../spec/types.js';
import { parseHar, HarError, isReadOnlyStep, type ImportStep } from './har.js';
import { detectChaining } from './detect-chaining.js';

export { HarError };

export interface ImportResult {
  spec: Spec;
  yaml: string;
  stepCount: number;
}

/** Drop Authorization headers that still hold a literal (volatile) token (§13.4). */
function stripLeftoverAuth(steps: ImportStep[]): void {
  for (const step of steps) {
    const headers = step.rest?.headers;
    if (!headers) continue;
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'authorization' && !headers[key]!.includes('{{')) {
        delete headers[key];
      }
    }
    if (Object.keys(headers).length === 0) delete step.rest!.headers;
  }
}

/** Convert a HAR document into a draft spec (no responses). */
export function importHar(
  har: unknown,
  config: Config,
  name: string,
  options: { chaining?: boolean } = {},
): ImportResult {
  const steps = parseHar(har, config);
  if (steps.length === 0) {
    throw new HarError(
      `no API requests matched baseUrl ${config.baseUrl} (check import.include/exclude)`,
    );
  }

  if (options.chaining !== false) detectChaining(steps);
  stripLeftoverAuth(steps);

  const specSteps: SpecStep[] = steps.map((s) => ({
    name: s.name,
    ...(s.graphql ? { graphql: s.graphql } : {}),
    ...(s.rest ? { rest: s.rest } : {}),
    ...(s.capture ? { capture: s.capture } : {}),
  }));

  // A suite that only reads (GET/HEAD + GraphQL queries) doesn't modify the DB.
  const pure = steps.every(isReadOnlyStep);

  const spec: Spec = {
    name,
    description: `Imported from HAR — review chaining/captures before generate.`,
    ...(pure ? { pure: true } : {}),
    steps: specSteps,
  };

  // Validate the emitted spec so import never produces something `generate` rejects.
  SpecSchema.parse(spec);

  const yaml = stringifyYaml(spec, { lineWidth: 0, blockQuote: 'literal' });
  return { spec, yaml, stepCount: steps.length };
}
