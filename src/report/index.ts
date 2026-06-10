import type { RunSummary } from '../run.js';
import { renderPretty, renderScenarioBlock, renderSummaryLine } from './pretty.js';
import { renderJson } from './json.js';
import { renderJunit } from './junit.js';

export type ReporterKind = 'pretty' | 'json' | 'junit';

export function isReporterKind(value: string): value is ReporterKind {
  return value === 'pretty' || value === 'json' || value === 'junit';
}

export function render(kind: ReporterKind, summary: RunSummary): string {
  switch (kind) {
    case 'json':
      return renderJson(summary);
    case 'junit':
      return renderJunit(summary);
    case 'pretty':
      return renderPretty(summary);
  }
}

export { renderPretty, renderScenarioBlock, renderSummaryLine, renderJson, renderJunit };
