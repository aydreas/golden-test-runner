import type { RunSummary, ScenarioResult, StepResult } from '../run.js';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stepFailures(step: StepResult): string[] {
  const out: string[] = [];
  if (step.statusMismatch) {
    out.push(`status: expected ${step.statusMismatch.expected}, got ${step.statusMismatch.actual}`);
  }
  for (const m of step.mismatches) out.push(`${m.path}: ${m.message}`);
  return out;
}

function renderCase(scenario: ScenarioResult, step: StepResult): string {
  const name = escapeXml(`${step.index + 1} ${step.name}`);
  const classname = escapeXml(scenario.name);
  const failures = stepFailures(step);
  if (failures.length === 0) {
    return `    <testcase name="${name}" classname="${classname}"/>`;
  }
  const message = escapeXml(failures[0]!);
  const body = escapeXml(failures.join('\n'));
  return (
    `    <testcase name="${name}" classname="${classname}">\n` +
    `      <failure message="${message}">${body}</failure>\n` +
    `    </testcase>`
  );
}

function renderSuite(scenario: ScenarioResult): string {
  const lines: string[] = [];
  const failures = scenario.steps.filter((s) => !s.ok).length + (scenario.error ? 1 : 0);
  lines.push(
    `  <testsuite name="${escapeXml(scenario.name)}" tests="${scenario.steps.length}" failures="${failures}">`,
  );
  for (const step of scenario.steps) lines.push(renderCase(scenario, step));
  if (scenario.error) {
    const msg = escapeXml(`${scenario.error.stepName}: ${scenario.error.message}`);
    lines.push(
      `    <testcase name="${escapeXml(`${scenario.error.stepIndex + 1} ${scenario.error.stepName}`)}" classname="${escapeXml(scenario.name)}">\n` +
        `      <error message="${msg}"></error>\n` +
        `    </testcase>`,
    );
  }
  lines.push('  </testsuite>');
  return lines.join('\n');
}

/** JUnit XML for CI test reporting. */
export function renderJunit(summary: RunSummary): string {
  const tests = summary.results.reduce((n, r) => n + r.steps.length, 0);
  const failures = summary.results.reduce(
    (n, r) => n + r.steps.filter((s) => !s.ok).length + (r.error ? 1 : 0),
    0,
  );
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<testsuites tests="${tests}" failures="${failures}">`);
  for (const result of summary.results) lines.push(renderSuite(result));
  lines.push('</testsuites>');
  return lines.join('\n');
}
