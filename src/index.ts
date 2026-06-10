/**
 * Programmatic API for golden-test-runner.
 *
 * Commands are wired up across milestones:
 *   generate (M2), run (M3), import (M5).
 */
export { loadConfig, validateConfig, ConfigError } from './config/load.js';
export type { Config } from './config/schema.js';
export * from './spec/types.js';
