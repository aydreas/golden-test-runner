/**
 * Generate JSON Schema files from the zod definitions so editors (WebStorm,
 * VS Code, …) can autocomplete and validate the YAML files. Run: `npm run gen:schema`.
 * The schemas are derived from the same zod schemas used for runtime validation,
 * so they never drift.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { SpecSchema, GoldenSchema } from '../src/spec/types.js';
import { ConfigSchema } from '../src/config/schema.js';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'schemas');

const targets = [
  { name: 'spec', schema: SpecSchema, title: 'golden-test-runner — spec file' },
  { name: 'golden', schema: GoldenSchema, title: 'golden-test-runner — golden scenario file' },
  { name: 'config', schema: ConfigSchema, title: 'golden-test-runner — config file' },
] as const;

await mkdir(outDir, { recursive: true });

for (const { name, schema, title } of targets) {
  // `io: 'input'` describes the file as authored (fields with defaults are optional).
  const json = z.toJSONSchema(schema, { io: 'input' }) as Record<string, unknown>;
  json.title = title;
  const path = join(outDir, `${name}.schema.json`);
  await writeFile(path, JSON.stringify(json, null, 2) + '\n', 'utf8');
  console.log(`wrote ${path}`);
}