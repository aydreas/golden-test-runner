import { stringify as stringifyYaml } from 'yaml';
import type { Golden } from '../spec/types.js';

/** Serialize a golden scenario to YAML. */
export function serializeGolden(golden: Golden): string {
  return stringifyYaml(golden, {
    lineWidth: 0, // don't wrap long scalars (queries, urls)
    blockQuote: 'literal',
  });
}
