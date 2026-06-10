import type { RunSummary } from '../run.js';

/** Machine-readable summary for CI consumption. */
export function renderJson(summary: RunSummary): string {
  const out = {
    ok: summary.ok,
    passed: summary.passed,
    failed: summary.failed,
    scenarios: summary.results.map((r) => ({
      name: r.name,
      file: r.file,
      ok: r.ok,
      error: r.error,
      steps: r.steps.map((s) => ({
        index: s.index,
        name: s.name,
        ok: s.ok,
        request: {
          kind: s.request.kind,
          method: s.request.method,
          url: s.request.url,
          ...(s.request.kind === 'graphql' ? { operationName: s.request.operationName } : {}),
        },
        statusMismatch: s.statusMismatch,
        mismatches: s.mismatches,
      })),
    })),
  };
  return JSON.stringify(out, null, 2);
}
