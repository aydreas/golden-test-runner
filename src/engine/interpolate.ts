import { Context } from './context.js';
import { PLACEHOLDER_RE, PLACEHOLDER_GLOBAL_RE } from '../spec/types.js';

export class InterpolationError extends Error {}

/**
 * Interpolate a single string against the context.
 *  - If the whole string is exactly `{{name}}`, return the bound value verbatim
 *    (preserving its type — a captured number stays a number).
 *  - Otherwise substitute every `{{name}}` occurrence textually (stringified).
 */
export function interpolateString(input: string, ctx: Context): unknown {
  const exact = input.match(PLACEHOLDER_RE);
  if (exact) {
    const name = exact[1]!;
    if (!ctx.has(name)) throw new InterpolationError(`unknown variable {{${name}}}`);
    return ctx.get(name);
  }

  return input.replace(PLACEHOLDER_GLOBAL_RE, (_m, name: string) => {
    if (!ctx.has(name)) throw new InterpolationError(`unknown variable {{${name}}}`);
    const value = ctx.get(name);
    return typeof value === 'string' ? value : JSON.stringify(value);
  });
}

/**
 * Interpolate default headers leniently: a header whose placeholders aren't all
 * bound yet is omitted rather than throwing. This is what lets the configured
 * auth pattern (`Authorization: "Bearer {{token}}"`) work — the header simply
 * isn't sent until a login step binds `token`. Request-level interpolation
 * stays strict (an unbound var there is a real typo).
 */
export function interpolateDefaultHeaders(
  headers: Record<string, string>,
  ctx: Context,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    try {
      out[name] = String(interpolateString(value, ctx));
    } catch (err) {
      if (err instanceof InterpolationError) continue; // drop until bound
      throw err;
    }
  }
  return out;
}

/** Recursively interpolate every string within a value. */
export function interpolateDeep<T>(value: T, ctx: Context): T {
  if (typeof value === 'string') {
    return interpolateString(value, ctx) as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => interpolateDeep(v, ctx)) as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = interpolateDeep(v, ctx);
    }
    return out as T;
  }
  return value;
}
