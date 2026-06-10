import type { Capture } from '../spec/types.js';
import { pointersFor, setAtPointer } from './pointer.js';

/** Deep structural equality for JSON-ish values. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    if (ka.length !== kb.length) return false;
    return ka.every((k) =>
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    );
  }
  return false;
}

/**
 * Whether a captured value is distinctive enough to replace by value at reuse
 * sites without risking collisions with unrelated fields (§12). Booleans, null,
 * short integers and very short strings are not.
 */
export function isDistinctive(value: unknown): boolean {
  if (typeof value === 'string') return value.length >= 4;
  if (typeof value === 'number') return !Number.isInteger(value) || Math.abs(value) >= 1000;
  return false;
}

/** Recursively replace every node deep-equal to `target` with `replacement`. */
function replaceByValue(node: unknown, target: unknown, replacement: string): unknown {
  if (deepEqual(node, target)) return replacement;
  if (Array.isArray(node)) return node.map((v) => replaceByValue(v, target, replacement));
  if (node !== null && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) out[k] = replaceByValue(v, target, replacement);
    return out;
  }
  return node;
}

export interface SymbolizeInput {
  /** Recorded response bodies, one per step (cloned & mutated in place). */
  bodies: unknown[];
  /** Per-step capture declarations (index-aligned with bodies). */
  captures: (Capture | undefined)[];
  /** Final captured name → concrete value bindings. */
  captured: Record<string, unknown>;
}

/**
 * Replace captured concrete values with `{{name}}` placeholders across recorded
 * responses:
 *  - at the exact capture-source JSONPath (always, structural & unambiguous), and
 *  - at reuse sites in any response (by value, guarded to distinctive values).
 * Returns the symbolized bodies (same array, mutated/replaced entries).
 */
export function symbolize(input: SymbolizeInput): unknown[] {
  const bodies = input.bodies.map((b) => (b === undefined ? b : structuredClone(b)));

  // 1. Capture sources: set the exact node(s) each capture read from.
  input.captures.forEach((capture, i) => {
    if (!capture) return;
    for (const [name, path] of Object.entries(capture)) {
      for (const pointer of pointersFor(path, bodies[i])) {
        setAtPointer(bodies[i], pointer, `{{${name}}}`);
      }
    }
  });

  // 2. Reuse sites: replace distinctive captured values wherever they recur.
  for (const [name, value] of Object.entries(input.captured)) {
    if (!isDistinctive(value)) continue;
    for (let i = 0; i < bodies.length; i++) {
      if (bodies[i] !== undefined) bodies[i] = replaceByValue(bodies[i], value, `{{${name}}}`);
    }
  }

  return bodies;
}
