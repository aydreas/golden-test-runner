// Shell-invokable DB reset for the fixture API.
// Used as the `reset.command` so the engine's reset hook has a real shell
// command to run. Targets the URL in GOLDEN_FIXTURE_URL (defaults to :8000).
const base = process.env.GOLDEN_FIXTURE_URL ?? 'http://127.0.0.1:8000';
const res = await fetch(`${base}/__reset__`, { method: 'POST' });
if (!res.ok) {
  console.error(`reset failed: ${res.status}`);
  process.exit(1);
}
