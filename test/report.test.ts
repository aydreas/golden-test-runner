import { describe, it, expect } from 'vitest';
import { render } from '../src/report/index.js';
import type { RunSummary } from '../src/run.js';

const summary: RunSummary = {
  passed: 1,
  failed: 1,
  ok: false,
  results: [
    {
      name: 'ok-scenario',
      file: 'a.golden.yaml',
      ok: true,
      steps: [
        {
          index: 0,
          name: 'step1',
          ok: true,
          request: { kind: 'rest', method: 'GET', url: 'http://x/api/a', headers: {} },
          mismatches: [],
        },
      ],
    },
    {
      name: 'bad-scenario',
      file: 'b.golden.yaml',
      ok: false,
      steps: [
        {
          index: 0,
          name: 'step1',
          ok: false,
          request: { kind: 'graphql', method: 'POST', url: 'http://x/graphql', headers: {}, operationName: 'Op', query: '', body: { query: '' }, bodyText: '' },
          statusMismatch: { expected: 200, actual: 500 },
          mismatches: [{ path: 'data.x', kind: 'value', message: 'expected "a", got "b"' }],
        },
      ],
    },
  ],
};

describe('reporters', () => {
  it('json is parseable and reflects results', () => {
    const obj = JSON.parse(render('json', summary));
    expect(obj.ok).toBe(false);
    expect(obj.scenarios).toHaveLength(2);
    expect(obj.scenarios[1].steps[0].mismatches[0].path).toBe('data.x');
  });

  it('junit emits testsuites with a failure', () => {
    const xml = render('junit', summary);
    expect(xml).toContain('<?xml');
    expect(xml).toContain('<testsuites');
    expect(xml).toContain('<failure');
    expect(xml).toContain('classname="bad-scenario"');
  });

  it('pretty includes scenario names and the summary tail', () => {
    const out = render('pretty', summary);
    expect(out).toContain('ok-scenario');
    expect(out).toContain('bad-scenario');
    expect(out).toContain('2 scenarios, 1 passed, 1 failed');
  });
});
