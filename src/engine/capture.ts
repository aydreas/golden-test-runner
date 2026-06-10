import { JSONPath } from 'jsonpath-plus';
import { Context } from './context.js';
import type { Capture } from '../spec/types.js';

export class CaptureError extends Error {}

/** Evaluate a JSONPath against a body and return the single matched value. */
export function evalPath(path: string, json: unknown): unknown {
  const matches = JSONPath({ path, json: json as object, wrap: true }) as unknown[];
  return matches.length > 0 ? matches[0] : undefined;
}

/**
 * Apply a step's `capture` map against its response body, binding each
 * placeholder name to the concrete value found at its JSONPath.
 */
export function applyCaptures(capture: Capture | undefined, body: unknown, ctx: Context): void {
  if (!capture) return;
  for (const [name, path] of Object.entries(capture)) {
    const value = evalPath(path, body);
    if (value === undefined) {
      throw new CaptureError(`capture "${name}" matched nothing at path ${path}`);
    }
    ctx.bind(name, value);
  }
}
