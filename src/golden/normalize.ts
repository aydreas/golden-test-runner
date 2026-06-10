import { IGNORE_SENTINEL } from '../spec/types.js';
import { pointersFor, setAtPointer } from './pointer.js';

/**
 * Merge global ignore paths with a scenario's own `ignores` (§7).
 * Deduplicated, global first.
 */
export function effectiveIgnorePaths(
  globalIgnorePaths: string[],
  scenarioIgnores: string[] | undefined,
): string[] {
  return [...new Set([...globalIgnorePaths, ...(scenarioIgnores ?? [])])];
}

/**
 * Replace every node matched by an ignore path with the `<<ignore>>` sentinel,
 * at generate time, so goldens don't churn on volatile values (§7).
 * Mutates and returns each body.
 */
export function applyIgnores(bodies: unknown[], ignorePaths: string[]): unknown[] {
  for (let i = 0; i < bodies.length; i++) {
    if (bodies[i] === undefined) continue;
    for (const path of ignorePaths) {
      for (const pointer of pointersFor(path, bodies[i])) {
        if (pointer === '') {
          bodies[i] = IGNORE_SENTINEL;
        } else {
          setAtPointer(bodies[i], pointer, IGNORE_SENTINEL);
        }
      }
    }
  }
  return bodies;
}
