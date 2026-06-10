import { describe, it, expect } from 'vitest';
import { Context } from '../src/engine/context.js';
import { interpolateString, interpolateDeep, InterpolationError } from '../src/engine/interpolate.js';
import { applyCaptures, evalPath, CaptureError } from '../src/engine/capture.js';

describe('interpolation', () => {
  it('returns the raw value for an exact {{name}} (preserves type)', () => {
    const ctx = new Context();
    ctx.bind('count', 42);
    expect(interpolateString('{{count}}', ctx)).toBe(42);
  });

  it('substitutes placeholders inside a larger string', () => {
    const ctx = new Context();
    ctx.bind('token', 'abc');
    expect(interpolateString('Bearer {{token}}', ctx)).toBe('Bearer abc');
  });

  it('walks nested structures', () => {
    const ctx = new Context();
    ctx.bind('userId', 'u1');
    const out = interpolateDeep(
      { author: '{{userId}}', meta: { tags: ['x', '{{userId}}'] } },
      ctx,
    );
    expect(out).toEqual({ author: 'u1', meta: { tags: ['x', 'u1'] } });
  });

  it('throws on an unknown variable', () => {
    expect(() => interpolateString('{{missing}}', new Context())).toThrow(InterpolationError);
  });
});

describe('capture', () => {
  it('binds values from JSONPaths', () => {
    const ctx = new Context();
    const body = { data: { createUser: { id: 'u9' } }, token: 't1' };
    applyCaptures({ userId: '$.data.createUser.id', token: '$.token' }, body, ctx);
    expect(ctx.get('userId')).toBe('u9');
    expect(ctx.get('token')).toBe('t1');
  });

  it('throws when a capture path matches nothing', () => {
    expect(() => applyCaptures({ x: '$.nope' }, {}, new Context())).toThrow(CaptureError);
  });

  it('evalPath returns undefined for no match', () => {
    expect(evalPath('$.a.b', {})).toBeUndefined();
  });
});
