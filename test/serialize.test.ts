import { describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { serializeGolden } from '../src/golden/serialize.js';
import type { Golden } from '../src/spec/types.js';

const golden: Golden = {
  name: 's',
  specHash: 'sha256:abc',
  generatedAt: '2026-06-10T12:00:00.000Z',
  steps: [
    { name: 'a', rest: { method: 'GET', path: '/x' }, response: { status: 200, body: { ok: true } } },
  ],
};

describe('serializeGolden', () => {
  it('quotes generatedAt so it stays a string (not a YAML date)', () => {
    const yaml = serializeGolden(golden);
    expect(yaml).toContain('generatedAt: "2026-06-10T12:00:00.000Z"');
    // round-trips as a string even under a 1.1-style parser default
    expect(typeof parseYaml(yaml).generatedAt).toBe('string');
  });
});