#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

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
  .action(async () => {
    console.error('generate: not implemented yet (M2)');
    process.exitCode = 1;
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
