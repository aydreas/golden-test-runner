import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import { ZodError } from 'zod';
import { SpecSchema, GoldenSchema, type Spec, type Golden } from './types.js';

export class SpecParseError extends Error {}

function formatZodError(err: ZodError, file: string): string {
  const issues = err.issues
    .map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  return `Invalid file ${file}:\n${issues}`;
}

/** Deterministic JSON with sorted keys — stable across formatting changes. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Hash a spec's semantic content (name + steps), ignoring formatting and
 * comments. Used to detect spec drift between a spec and its golden.
 */
export function hashSpec(spec: Spec): string {
  const canonical = stableStringify({ name: spec.name, steps: spec.steps });
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

export async function parseSpec(file: string): Promise<Spec> {
  const content = await readFile(file, 'utf8');
  let raw: unknown;
  try {
    raw = parseYaml(content);
  } catch (err) {
    throw new SpecParseError(`Failed to parse YAML in ${file}: ${String((err as Error).message)}`);
  }
  try {
    return SpecSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) throw new SpecParseError(formatZodError(err, file));
    throw err;
  }
}

export async function parseGolden(file: string): Promise<Golden> {
  const content = await readFile(file, 'utf8');
  let raw: unknown;
  try {
    raw = parseYaml(content);
  } catch (err) {
    throw new SpecParseError(`Failed to parse YAML in ${file}: ${String((err as Error).message)}`);
  }
  try {
    return GoldenSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) throw new SpecParseError(formatZodError(err, file));
    throw err;
  }
}
