import { parseCliArgs } from './cli-options.js';
import { runCordy } from './run.js';
import { readFile } from 'node:fs/promises';
import { createConfigFile, findConfig, loadConfig, type CordyConfig } from './config.js';
import { parseManagedFile } from './managed-output.js';

export const help = `cordy - natural-language Playwright automation with Jev

Usage:
  npx cordy "Complete the form" --start-url https://example.test --input email=ana@example.com
  npx cordy --prompt-file ./task.txt --input ./inputs.json --headed --output ./automation.ts
  npx cordy tests ./flows.spec.ts [--json]

Options:
  --input <key=value|file.json>  Repeatable input or JSON file
  --prompt-file <file>            Instruction from a file
  --config <file>                 TOML/YAML configuration
  --start-url <url>               Required starting URL
  --headed                        Show the browser
  --headless                      Run without UI (default)
  --dry-run                       Plan without executing
  --approve                       Approve high-impact actions
  --output <file>                 Generate TypeScript/TSX
  --output-kind <test|automation> Generate assertions or automation only
  --test-name <slug>              Write the test as a named Cordy block (test output only)
  --update                        Replace the existing block named by --test-name
  --diff                          Run, then print the diff instead of writing --output
  --expect-visible <text>         Repeatable visible-text assertion
  --expect-button <name>          Repeatable assertion by accessible button name
  --expect-url <url>              Repeatable URL assertion
  --max-steps <n>                 Maximum actions (default: 20)
  --json                          JSON result
  --verbose                       Safe diagnostics for each Jev interaction
  --help                          Show help

Commands:
  init [--format toml|yaml]       Create a configuration file
  tests <file> [--json]           List Cordy-managed tests in a file`;

export async function listManagedTests(args: string[]) {
  const json = args.includes('--json');
  const file = args.find((arg) => !arg.startsWith('-'));
  if (!file) {
    console.error('usage: cordy tests <file> [--json]');
    return 1;
  }
  let content: string;
  try {
    content = await readFile(file, 'utf8');
  } catch {
    console.error(`file not found: ${file}`);
    return 1;
  }
  const parsed = parseManagedFile(content);
  const invalid =
    parsed.problems.length > 0 || parsed.blocks.some((block) => block.status !== 'ok');
  if (json) {
    console.log(JSON.stringify({ file, tests: parsed.blocks, problems: parsed.problems }, null, 2));
    return invalid ? 1 : 0;
  }
  if (!parsed.blocks.length && !parsed.problems.length) {
    console.log(`No Cordy-managed tests found in ${file}`);
    return 0;
  }
  const rows = parsed.blocks.map((block) => [
    block.slug,
    `${block.startLine}-${block.endLine ?? '?'}`,
    block.status === 'ok'
      ? 'ok'
      : block.problems.map((problem) => `${problem.message} (line ${problem.line})`).join('; '),
  ]);
  const table = [['SLUG', 'LINES', 'STATUS'], ...rows];
  const widths = [0, 1].map((column) => Math.max(...table.map((row) => row[column].length)));
  for (const row of table)
    console.log(`${row[0].padEnd(widths[0])}  ${row[1].padEnd(widths[1])}  ${row[2]}`);
  for (const problem of parsed.problems) console.log(`line ${problem.line}: ${problem.message}`);
  return invalid ? 1 : 0;
}

export async function main(args = process.argv.slice(2)) {
  if (args[0] === 'init') {
    const format = args.includes('--format') ? args[args.indexOf('--format') + 1] : 'toml';
    if (format !== 'toml' && format !== 'yaml') throw new Error('--format must be toml or yaml');
    const file = await createConfigFile(process.cwd(), format);
    console.log(`Configuration created: ${file}`);
    return 0;
  }
  if (args[0] === 'tests') return listManagedTests(args.slice(1));
  if (args.includes('--help') || args.includes('-h')) {
    console.log(help);
    return 0;
  }
  try {
    const options = parseCliArgs(args);
    const configPath = findConfig(process.cwd(), options.configFile);
    const config: CordyConfig = configPath
      ? await loadConfig(configPath)
      : { jev: { apiKeyEnv: 'JEV_API_KEY' }, browser: { headed: false, maxSteps: 20 } };
    const effective = {
      ...options,
      headed: options.headed || config.browser.headed,
      startUrl: options.startUrl ?? config.browser.startUrl,
      origin: options.origin ?? config.browser.origin,
      maxSteps: options.maxSteps === 20 ? config.browser.maxSteps : options.maxSteps,
    };
    const result = await runCordy(effective, config);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      if (result.diff) process.stdout.write(result.diff);
      if (result.output?.message) console.log(result.output.message);
      console.log(
        `Cordy finished with ${result.actions.length} action(s): ${result.actions.map((action) => action.status).join(', ')}${result.expectations.length ? `; expectations: ${result.expectations.map((expectation) => expectation.status).join(', ')}` : ''}`,
      );
    }
    return result.actions.some((action) => action.status === 'failed') ||
      result.expectations.some((expectation) => expectation.status === 'failed')
      ? 1
      : 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
