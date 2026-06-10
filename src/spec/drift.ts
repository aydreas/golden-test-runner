import type { Config } from '../config/schema.js';
import { discover } from './discover.js';
import { parseSpec, hashSpec } from './parse.js';

/**
 * Hash every discoverable spec by scenario name, so `run` can detect when a
 * golden was generated from a spec that has since changed (§12).
 * Specs that fail to parse are skipped (they'll surface during generate).
 */
export async function loadSpecHashes(config: Config): Promise<Map<string, string>> {
  const files = await discover(config.paths.specs);
  const map = new Map<string, string>();
  for (const file of files) {
    try {
      const spec = await parseSpec(file);
      map.set(spec.name, hashSpec(spec));
    } catch {
      // ignore unparseable specs here
    }
  }
  return map;
}
