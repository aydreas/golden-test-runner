import type { RunSummary, ScenarioResult, StepResult } from '../run.js';
import type { SentRequest } from '../transport/index.js';

// Minimal ANSI styling; honors NO_COLOR.
const useColor = !process.env.NO_COLOR && process.stdout.isTTY;
const c = (code: number, s: string) => (useColor ? `[${code}m${s}[0m` : s);
const red = (s: string) => c(31, s);
const green = (s: string) => c(32, s);
const dim = (s: string) => c(2, s);
const bold = (s: string) => c(1, s);

const PASS = green('✓');
const FAIL = red('✗');

function requestLabel(req: SentRequest): string {
  if (req.kind === 'graphql') {
    const op = req.operationName ? ` ${req.operationName}` : '';
    return `GraphQL${op}`;
  }
  return `${req.method} ${new URL(req.url).pathname}`;
}

function renderStep(step: StepResult): string[] {
  const lines: string[] = [];
  const marker = step.ok ? PASS : FAIL;
  const dur = step.durationMs != null ? ` ${dim(`(${step.durationMs}ms)`)}` : '';
  const head = `  ${marker} ${step.index + 1} ${step.name}${dur}`;
  lines.push(step.ok ? head : `${head}   ${dim(requestLabel(step.request))}`);

  if (step.statusMismatch) {
    lines.push(
      `        ${red('status')}   expected ${step.statusMismatch.expected}   actual ${step.statusMismatch.actual}`,
    );
  }
  for (const m of step.mismatches) {
    lines.push(`        ${m.path}   ${m.message}`);
  }
  return lines;
}

function renderScenario(result: ScenarioResult): string[] {
  const lines: string[] = [];
  const marker = result.ok ? PASS : FAIL;
  lines.push(`${marker} ${bold(result.name)}   ${dim(`(${result.file})`)}`);

  if (result.drift) {
    lines.push(`  ${c(33, '⚠')} spec drift — golden was generated from a different spec (regenerate)`);
  }

  for (const step of result.steps) lines.push(...renderStep(step));

  if (result.error) {
    lines.push(
      `  ${FAIL} ${result.error.stepIndex + 1} ${result.error.stepName}   ${red('error')} ${result.error.message}`,
    );
  }
  return lines;
}

/** One scenario block (header + steps + blank line). Safe to write to stdout incrementally. */
export function renderScenarioBlock(result: ScenarioResult): string {
  return renderScenario(result).join('\n') + '\n\n';
}

/** Final summary line only (scenario/pass/fail counts). */
export function renderSummaryLine(summary: RunSummary): string {
  const fieldMismatches = summary.results.reduce(
    (n, r) => n + r.steps.reduce((m, s) => m + s.mismatches.length + (s.statusMismatch ? 1 : 0), 0),
    0,
  );
  const total = summary.results.length;
  const tail =
    `${total} scenario${total === 1 ? '' : 's'}, ` +
    `${summary.passed} passed, ${summary.failed} failed` +
    (fieldMismatches > 0 ? ` (${fieldMismatches} field mismatch${fieldMismatches === 1 ? '' : 'es'})` : '');
  return summary.ok ? green(tail) : red(tail);
}

export function renderPretty(summary: RunSummary): string {
  return summary.results.map(renderScenarioBlock).join('') + renderSummaryLine(summary);
}
