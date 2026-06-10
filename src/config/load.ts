import { cosmiconfig } from 'cosmiconfig';
import { parse as parseYaml } from 'yaml';
import { ZodError } from 'zod';
import { ConfigSchema, type Config } from './schema.js';

const MODULE_NAME = 'goldentest';

/** Tell cosmiconfig how to parse `.yaml`/`.yml` config files. */
function yamlLoader(_filepath: string, content: string): unknown {
  return parseYaml(content);
}

function explorer() {
  return cosmiconfig(MODULE_NAME, {
    searchPlaces: [
      'package.json',
      `${MODULE_NAME}.config.js`,
      `${MODULE_NAME}.config.cjs`,
      `${MODULE_NAME}.config.mjs`,
      `${MODULE_NAME}.config.json`,
      `${MODULE_NAME}.config.yaml`,
      `${MODULE_NAME}.config.yml`,
      `.${MODULE_NAME}rc`,
      `.${MODULE_NAME}rc.yaml`,
      `.${MODULE_NAME}rc.yml`,
      `.${MODULE_NAME}rc.json`,
    ],
    loaders: {
      '.yaml': yamlLoader,
      '.yml': yamlLoader,
      noExt: yamlLoader,
    },
  });
}

export class ConfigError extends Error {}

function formatZodError(err: ZodError, filepath?: string): string {
  const where = filepath ? ` in ${filepath}` : '';
  const issues = err.issues
    .map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  return `Invalid config${where}:\n${issues}`;
}

/** Validate an already-loaded raw config object. */
export function validateConfig(raw: unknown, filepath?: string): Config {
  try {
    return ConfigSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) throw new ConfigError(formatZodError(err, filepath));
    throw err;
  }
}

export interface LoadConfigOptions {
  /** Explicit config path (from `--config`). */
  configPath?: string;
  /** Directory to start searching from. */
  cwd?: string;
}

export interface LoadedConfig {
  config: Config;
  filepath: string;
}

/** Find, load and validate the config, applying all schema defaults. */
export async function loadConfig(opts: LoadConfigOptions = {}): Promise<LoadedConfig> {
  const exp = explorer();
  const result = opts.configPath
    ? await exp.load(opts.configPath)
    : await exp.search(opts.cwd);

  if (!result || result.isEmpty) {
    throw new ConfigError(
      opts.configPath
        ? `Config file is empty: ${opts.configPath}`
        : `No goldentest config found (looked for ${MODULE_NAME}.config.yaml and friends).`,
    );
  }

  return {
    config: validateConfig(result.config, result.filepath),
    filepath: result.filepath,
  };
}
