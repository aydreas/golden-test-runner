import { execa } from 'execa';
import type { Config } from '../config/schema.js';

export class ResetError extends Error {}

/**
 * Whether reset is configured to run at all. Precedence:
 *   CLI --no-reset (forceDisabled) > config.reset.enabled
 * Whether it runs for a *given* scenario also depends on `pure` (a scenario
 * preceded by a pure one needs no reset) — that's decided by the orchestrator.
 */
export function resetEnabled(config: Config, forceDisabled: boolean): boolean {
  if (forceDisabled) return false;
  return config.reset.enabled;
}

/** Run the configured DB-reset shell command. No-op if no command is set. */
export async function runReset(config: Config): Promise<void> {
  const { command, cwd, timeoutMs } = config.reset;
  if (!command) {
    throw new ResetError('reset is enabled but no reset.command is configured');
  }
  try {
    await execa(command, {
      shell: true,
      cwd,
      timeout: timeoutMs,
      stdio: 'pipe',
    });
  } catch (err) {
    throw new ResetError(`reset command failed: ${String((err as Error).message)}`);
  }
}
