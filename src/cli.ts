#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig } from './config/load.js';
import { discover } from './spec/discover.js';
import { generate } from './golden/generate.js';
import { runGoldens } from './run.js';
import { render, isReporterKind } from './report/index.js';
import { loadSpecHashes } from './spec/drift.js';
import { importHar } from './import/index.js';
import { readFile, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';

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
        const { outputPath, skipped } = await generate(specFile, config, {
          forceNoReset: opts.reset === false,
          outDir: opts.out,
          update: opts.update,
          now: new Date().toISOString(),
        });
        if (skipped) {
          console.log(`• skipped ${outputPath} (exists — use --update to regenerate)`);
        } else {
          console.log(`✓ generated ${outputPath}`);
        }
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
  .option('--strict', 'fail (not just warn) when a golden is out of date vs its spec')
  .action(async (opts) => {
    try {
      if (!isReporterKind(opts.reporter)) fail(`Unknown reporter: ${opts.reporter}`);
      const { config } = await loadConfig({ configPath: opts.config });
      const pattern = opts.file ?? join(config.paths.goldenDir, '**/*.golden.yaml');
      const goldens = await discover(pattern);
      if (goldens.length === 0) fail(`No golden files matched: ${pattern}`);

      const summary = await runGoldens(goldens, config, {
        forceNoReset: opts.reset === false,
        filter: opts.filter,
        bail: opts.bail,
        concurrency: opts.concurrency,
        strict: opts.strict,
        specHashes: await loadSpecHashes(config),
        onWarn: (msg) => console.error(`⚠ ${msg}`),
      });

      console.log(render(opts.reporter, summary));
      if (!summary.ok) process.exit(1);
    } catch (err) {
      fail(String((err as Error).message));
    }
  });

program
  .command('import')
  .description('Convert a HAR recording into a draft spec file')
  .requiredOption('--har <file>', 'HAR file exported from the browser')
  .option('--name <scenario>', 'scenario name')
  .option('-o, --out <path>', 'output spec path')
  .option('-c, --config <path>', 'path to config file')
  .option('--dry-run', 'print the spec without writing it')
  .action(async (opts) => {
    try {
      const { config } = await loadConfig({ configPath: opts.config });
      const har = JSON.parse(await readFile(opts.har, 'utf8'));
      const name = opts.name ?? basename(opts.har).replace(/\.har$/i, '');
      const { yaml, stepCount } = importHar(har, config, name);

      if (opts.dryRun) {
        console.log(yaml);
        return;
      }
      const outPath = opts.out ?? `${name}.spec.yaml`;
      await writeFile(outPath, yaml, 'utf8');
      console.log(`✓ imported ${stepCount} steps → ${outPath} (review before generate)`);
    } catch (err) {
      fail(String((err as Error).message));
    }
  });

program.parseAsync(process.argv);
