import { IGNORE_SENTINEL, PLACEHOLDER_RE } from '../spec/types.js';
import type { Matcher, MatcherType } from '../config/schema.js';
import { pointersFor } from './pointer.js';
import { deepEqual } from './symbolize.js';

export type MismatchKind =
  | 'status'
  | 'value'
  | 'type'
  | 'missing'
  | 'extra'
  | 'length'
  | 'matcher'
  | 'placeholder';

export interface Mismatch {
  /** Human-readable field path, e.g. "data.createPost.title". */
  path: string;
  kind: MismatchKind;
  message: string;
  expected?: unknown;
  actual?: unknown;
}

/** Scenario-wide placeholder bindings, persisted across steps for consistency. */
export class Bindings {
  private readonly map = new Map<string, unknown>();
  has(name: string): boolean {
    return this.map.has(name);
  }
  get(name: string): unknown {
    return this.map.get(name);
  }
  bind(name: string, value: unknown): void {
    this.map.set(name, value);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

function matcherOk(type: MatcherType, value: unknown, pattern?: string): boolean {
  switch (type) {
    case 'any':
      return true;
    case 'uuid':
      return typeof value === 'string' && UUID_RE.test(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'iso-date':
      return typeof value === 'string' && ISO_DATE_RE.test(value) && !Number.isNaN(Date.parse(value));
    case 'regex':
      return pattern !== undefined && new RegExp(pattern).test(String(value));
  }
}

interface CompareCtx {
  bindings: Bindings;
  /** pointer → matcher (governs the live node: type-check, not equality). */
  governed: Map<string, Matcher>;
  /** pointers (in the live tree) to ignore entirely. */
  ignored: Set<string>;
  mismatches: Mismatch[];
}

function display(pointer: string): string {
  return pointer === '' ? '(root)' : pointer.slice(1).replace(/\//g, '.');
}

function typeName(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function walk(golden: unknown, live: unknown, pointer: string, ctx: CompareCtx): void {
  // Ignore sentinel in the golden → skip this node entirely.
  if (golden === IGNORE_SENTINEL) return;
  if (ctx.ignored.has(pointer)) return;

  // Placeholder: consistency wildcard. Checked BEFORE matchers — an authored
  // {{name}} is the more specific constraint, and a matcher path (e.g. $..id)
  // often overlaps it. Matchers only govern nodes the golden left as a
  // representative concrete value.
  if (typeof golden === 'string') {
    const m = golden.match(PLACEHOLDER_RE);
    if (m) {
      const name = m[1]!;
      if (ctx.bindings.has(name)) {
        if (!deepEqual(ctx.bindings.get(name), live)) {
          ctx.mismatches.push({
            path: display(pointer),
            kind: 'placeholder',
            message: `{{${name}}} bound to ${JSON.stringify(ctx.bindings.get(name))} but got ${JSON.stringify(live)}`,
            expected: ctx.bindings.get(name),
            actual: live,
          });
        }
      } else {
        ctx.bindings.bind(name, live);
      }
      return;
    }
  }

  // Matcher governs this node: type/shape check against the live value.
  const matcher = ctx.governed.get(pointer);
  if (matcher) {
    if (!matcherOk(matcher.type, live, matcher.pattern)) {
      ctx.mismatches.push({
        path: display(pointer),
        kind: 'matcher',
        message: `expected ${matcher.type}${matcher.pattern ? ` /${matcher.pattern}/` : ''}, got ${JSON.stringify(live)}`,
        expected: matcher.type,
        actual: live,
      });
    }
    return;
  }

  // Arrays.
  if (Array.isArray(golden) && Array.isArray(live)) {
    if (golden.length !== live.length) {
      ctx.mismatches.push({
        path: display(pointer),
        kind: 'length',
        message: `array length expected ${golden.length}, got ${live.length}`,
        expected: golden.length,
        actual: live.length,
      });
    }
    const n = Math.min(golden.length, live.length);
    for (let i = 0; i < n; i++) walk(golden[i], live[i], `${pointer}/${i}`, ctx);
    return;
  }

  // Objects.
  if (golden !== null && typeof golden === 'object' && live !== null && typeof live === 'object' && !Array.isArray(live)) {
    const g = golden as Record<string, unknown>;
    const l = live as Record<string, unknown>;
    for (const key of Object.keys(g)) {
      const childPtr = `${pointer}/${escape(key)}`;
      if (!(key in l)) {
        if (g[key] === IGNORE_SENTINEL || ctx.governed.get(childPtr)?.type === 'any') continue;
        ctx.mismatches.push({
          path: display(childPtr),
          kind: 'missing',
          message: `missing key (expected ${JSON.stringify(g[key])})`,
          expected: g[key],
        });
        continue;
      }
      walk(g[key], l[key], childPtr, ctx);
    }
    for (const key of Object.keys(l)) {
      if (key in g) continue;
      const childPtr = `${pointer}/${escape(key)}`;
      if (ctx.ignored.has(childPtr)) continue;
      ctx.mismatches.push({
        path: display(childPtr),
        kind: 'extra',
        message: `unexpected key (got ${JSON.stringify(l[key])})`,
        actual: l[key],
      });
    }
    return;
  }

  // Primitives / type-mismatched nodes → exact equality.
  if (deepEqual(golden, live)) return;
  if (typeName(golden) !== typeName(live)) {
    ctx.mismatches.push({
      path: display(pointer),
      kind: 'type',
      message: `expected ${typeName(golden)} ${JSON.stringify(golden)}, got ${typeName(live)} ${JSON.stringify(live)}`,
      expected: golden,
      actual: live,
    });
  } else {
    ctx.mismatches.push({
      path: display(pointer),
      kind: 'value',
      message: `expected ${JSON.stringify(golden)}, got ${JSON.stringify(live)}`,
      expected: golden,
      actual: live,
    });
  }
}

function escape(key: string): string {
  return key.replace(/~/g, '~0').replace(/\//g, '~1');
}

export interface CompareBodyOptions {
  matchers: Matcher[];
  ignorePaths: string[];
  bindings: Bindings;
}

/** Compare a golden response body against a live one. */
export function compareBody(golden: unknown, live: unknown, opts: CompareBodyOptions): Mismatch[] {
  const governed = new Map<string, Matcher>();
  for (const matcher of opts.matchers) {
    for (const ptr of pointersFor(matcher.path, live)) governed.set(ptr, matcher);
  }
  const ignored = new Set<string>();
  for (const path of opts.ignorePaths) {
    for (const ptr of pointersFor(path, live)) ignored.add(ptr);
  }

  const ctx: CompareCtx = { bindings: opts.bindings, governed, ignored, mismatches: [] };
  walk(golden, live, '', ctx);
  return ctx.mismatches;
}
