#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig } from './config/load.js';
import { discover } from './spec/discover.js';
import { generate } from './golden/generate.js';

const program = new Command();

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

program
  .name('golden')
  .description('Golden-sample e2e test runner for REST and GraphQL APIs')
  .version('0.1.0');

program
  .command('generate')
  .description('Run spec(s) against the live API and record golden scenario files')
  .option('-f, --file <glob>', 'spec file or glob (defaults to config paths.specs)')
  .option('-o, --out <dir>', 'output directory for goldens (defaults to config paths.goldenDir)')
  .option('-c, --config <path>', 'path to config file')
  .option('--no-reset', 'skip the DB reset hook')
  .option('--update', 'regenerate existing goldens')
  .action(async (opts) => {
    try {
      const { config } = await loadConfig({ configPath: opts.config });
      const pattern = opts.file ?? config.paths.specs;
      const specs = await discover(pattern);
      if (specs.length === 0) fail(`No spec files matched: ${pattern}`);

      for (const specFile of specs) {
        const { outputPath } = await generate(specFile, config, {
          forceNoReset: opts.reset === false,
          outDir: opts.out,
          now: new Date().toISOString(),
        });
        console.log(`✓ generated ${outputPath}`);
      }
    } catch (err) {
      fail(String((err as Error).message));
    }
  });

program
  .command('run')
  .description('Run golden scenario(s) against the live API and diff responses')
  .option('-f, --file <glob>', 'golden file or glob (defaults to config paths.goldenDir)')
  .option('-c, --config <path>', 'path to config file')
  .option('--no-reset', 'skip the DB reset hook')
  .option('--bail', 'stop on first failing scenario')
  .option('--filter <name>', 'only run scenarios whose name matches')
  .option('--concurrency <n>', 'number of scenarios to run in parallel', (v) => parseInt(v, 10))
  .option('--reporter <kind>', 'pretty | json | junit', 'pretty')
  .action(async () => {
    console.error('run: not implemented yet (M3)');
    process.exitCode = 1;
  });

program
  .command('import')
  .description('Convert a HAR recording into a draft spec file')
  .requiredOption('--har <file>', 'HAR file exported from the browser')
  .option('--name <scenario>', 'scenario name')
  .option('-o, --out <path>', 'output spec path')
  .option('-c, --config <path>', 'path to config file')
  .option('--dry-run', 'print the spec without writing it')
  .action(async () => {
    console.error('import: not implemented yet (M5)');
    process.exitCode = 1;
  });

program.parseAsync(process.argv);
