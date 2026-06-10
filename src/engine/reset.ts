import { execa } from 'execa';
import type { Config } from '../config/schema.js';
import type { ScenarioConfig } from '../spec/types.js';

export class ResetError extends Error {}

/**
 * Decide whether reset runs for a scenario. Precedence:
 *   CLI --no-reset (forceDisabled) > scenario.config.reset > config.reset.enabled
 */
export function resetEnabled(
  config: Config,
  scenario: ScenarioConfig | undefined,
  forceDisabled: boolean,
): boolean {
  if (forceDisabled) return false;
  if (scenario?.reset !== undefined) return scenario.reset;
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
