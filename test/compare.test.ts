import { describe, it, expect } from 'vitest';
import { compareBody, Bindings, type Mismatch } from '../src/golden/compare.js';
import type { Matcher } from '../src/config/schema.js';

function cmp(
  golden: unknown,
  live: unknown,
  opts: { matchers?: Matcher[]; ignorePaths?: string[]; bindings?: Bindings } = {},
): Mismatch[] {
  return compareBody(golden, live, {
    matchers: opts.matchers ?? [],
    ignorePaths: opts.ignorePaths ?? [],
    bindings: opts.bindings ?? new Bindings(),
  });
}

describe('comparator', () => {
  it('passes on deep equality', () => {
    expect(cmp({ a: 1, b: ['x', { c: true }] }, { a: 1, b: ['x', { c: true }] })).toEqual([]);
  });

  it('reports value mismatches with path', () => {
    const m = cmp({ title: 'Hello World' }, { title: 'Hello Wrld' });
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ path: 'title', kind: 'value' });
  });

  it('reports type mismatches', () => {
    const m = cmp({ n: 1 }, { n: '1' });
    expect(m[0]!.kind).toBe('type');
  });

  it('reports missing and extra keys', () => {
    const m = cmp({ a: 1, b: 2 }, { a: 1, c: 3 });
    const kinds = m.map((x) => `${x.kind}:${x.path}`).sort();
    expect(kinds).toEqual(['extra:c', 'missing:b']);
  });

  it('reports array length differences', () => {
    const m = cmp([1, 2, 3], [1, 2]);
    expect(m[0]!.kind).toBe('length');
  });

  describe('placeholders', () => {
    it('binds first occurrence then requires consistency', () => {
      const b = new Bindings();
      expect(cmp({ id: '{{u}}' }, { id: 'abc' }, { bindings: b })).toEqual([]);
      expect(cmp({ author: { id: '{{u}}' } }, { author: { id: 'abc' } }, { bindings: b })).toEqual([]);
    });

    it('fails when a bound placeholder sees a different value', () => {
      const b = new Bindings();
      cmp({ id: '{{u}}' }, { id: 'abc' }, { bindings: b });
      const m = cmp({ id: '{{u}}' }, { id: 'xyz' }, { bindings: b });
      expect(m[0]!.kind).toBe('placeholder');
    });

    it('accepts any live value on first bind (fresh-DB ids)', () => {
      expect(cmp({ id: '{{u}}' }, { id: 'a-totally-different-id' })).toEqual([]);
    });

    it('enforces consistency even when a matcher path overlaps the placeholder', () => {
      // The headline case: $..id matcher AND {{u}} on the same nodes. The
      // placeholder must still bind+check, not be shadowed by the type-check.
      const matchers: Matcher[] = [{ path: '$..id', type: 'uuid' }];
      const u1 = '11111111-1111-1111-1111-111111111111';
      const u2 = '22222222-2222-2222-2222-222222222222';

      // Consistent ids (proper chaining) → pass.
      expect(
        cmp({ a: { id: '{{u}}' }, b: { id: '{{u}}' } }, { a: { id: u1 }, b: { id: u1 } }, { matchers }),
      ).toEqual([]);

      // Two valid uuids that differ → must be a placeholder mismatch (the real
      // API bug this tool exists to catch), NOT silently absorbed by the matcher.
      const m = cmp(
        { a: { id: '{{u}}' }, b: { id: '{{u}}' } },
        { a: { id: u1 }, b: { id: u2 } },
        { matchers },
      );
      expect(m).toHaveLength(1);
      expect(m[0]!.kind).toBe('placeholder');
    });
  });

  it('skips <<ignore>> fields', () => {
    expect(cmp({ createdAt: '<<ignore>>' }, { createdAt: '2026-01-01T00:00:00Z' })).toEqual([]);
  });

  it('ignores live-only extra keys matched by an ignorePath', () => {
    expect(cmp({ a: 1 }, { a: 1, debug: 'x' }, { ignorePaths: ['$..debug'] })).toEqual([]);
  });

  describe('matchers', () => {
    const u = '11111111-2222-3333-4444-555555555555';
    it('uuid type-checks instead of equality', () => {
      const matchers: Matcher[] = [{ path: '$..id', type: 'uuid' }];
      expect(cmp({ id: 'representative' }, { id: u }, { matchers })).toEqual([]);
      expect(cmp({ id: 'representative' }, { id: 'not-a-uuid' }, { matchers })[0]!.kind).toBe('matcher');
    });
    it('number / iso-date / any / regex', () => {
      expect(cmp({ n: 0 }, { n: 42 }, { matchers: [{ path: '$.n', type: 'number' }] })).toEqual([]);
      expect(cmp({ d: '' }, { d: '2026-06-10T12:00:00Z' }, { matchers: [{ path: '$.d', type: 'iso-date' }] })).toEqual([]);
      expect(cmp({ t: '' }, { t: 'anything' }, { matchers: [{ path: '$.t', type: 'any' }] })).toEqual([]);
      expect(cmp({ c: '' }, { c: 'AB12' }, { matchers: [{ path: '$.c', type: 'regex', pattern: '^[A-Z]{2}\\d{2}$' }] })).toEqual([]);
    });
  });
});
