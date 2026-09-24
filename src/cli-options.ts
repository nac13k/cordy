import { z } from 'zod';
import { parseExpectation } from './expectation-spec.js';
import { isValidTestSlug, TEST_SLUG_MAX_LENGTH } from './managed-output.js';

export const ParsedOptions = z.object({
  task: z.string().optional(),
  promptFile: z.string().optional(),
  plan: z.string().optional(),
  inputFile: z.string().optional(),
  configFile: z.string().optional(),
  inputs: z.record(z.string(), z.string()),
  files: z.record(z.string(), z.array(z.string().min(1)).min(1)),
  headed: z.boolean(),
  dryRun: z.boolean(),
  output: z.string().optional(),
  outputKind: z.enum(['test', 'automation']),
  testName: z.string().optional(),
  update: z.boolean(),
  diff: z.boolean(),
  expect: z.array(z.string()),
  expectVisible: z.array(z.string()),
  expectButtons: z.array(z.string()),
  expectUrl: z.array(z.string()),
  startUrl: z.string().optional(),
  origin: z.string().optional(),
  maxSteps: z.number(),
  json: z.boolean(),
  verbose: z.boolean(),
  approve: z.boolean(),
});
export type ParsedOptions = z.infer<typeof ParsedOptions>;

const INPUT_KEY = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

function parseInlineInput(value: string, inputs: Record<string, string>): boolean {
  const separator = value.indexOf('=');
  if (separator < 1 || !INPUT_KEY.test(value.slice(0, separator))) return false;
  inputs[value.slice(0, separator)] = value.slice(separator + 1);
  return true;
}

function parseFileInput(value: string, files: Record<string, string[]>) {
  const separator = value.indexOf('=');
  const key = value.slice(0, separator);
  if (separator < 1 || !INPUT_KEY.test(key))
    throw new Error(`--file must be key=path[,path...], got: ${value}`);
  const paths = value.slice(separator + 1).split(',');
  if (paths.some((path) => !path.trim()))
    throw new Error(`--file ${key} requires at least one non-empty path`);
  files[key] = paths.map((path) => path.trim());
}

export function parseCliArgs(args: string[]): ParsedOptions {
  const options: ParsedOptions = {
    inputs: {},
    files: {},
    headed: false,
    dryRun: false,
    outputKind: 'test',
    update: false,
    diff: false,
    expect: [],
    expectVisible: [],
    expectButtons: [],
    expectUrl: [],
    maxSteps: 20,
    json: false,
    verbose: false,
    approve: false,
  };
  const positional: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    // A prompt may start with a dash list marker (`- step`); option names never contain spaces.
    if (!arg.startsWith('-') || /^-\s/.test(arg)) {
      positional.push(arg);
      continue;
    }
    const next = () => {
      const value = args[++index];
      if (!value || value.startsWith('-')) throw new Error(`${arg} requires a value`);
      return value;
    };
    if (arg === '--headed') options.headed = true;
    else if (arg === '--headless') options.headed = false;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--verbose') options.verbose = true;
    else if (arg === '--approve') options.approve = true;
    else if (arg === '--prompt-file') options.promptFile = next();
    else if (arg === '--plan') {
      const value = args[++index];
      if (!value || (value.startsWith('-') && value !== '-'))
        throw new Error('--plan requires a file path or - for stdin');
      options.plan = value;
    } else if (arg === '--config') options.configFile = next();
    else if (arg === '--output') options.output = next();
    else if (arg === '--test-name') options.testName = next();
    else if (arg === '--update') options.update = true;
    else if (arg === '--diff') options.diff = true;
    else if (arg === '--output-kind') {
      const value = next();
      if (value !== 'test' && value !== 'automation')
        throw new Error('--output-kind must be test or automation');
      options.outputKind = value;
    } else if (arg === '--expect') options.expect.push(next());
    else if (arg === '--expect-visible') options.expectVisible.push(next());
    else if (arg === '--expect-button') options.expectButtons.push(next());
    else if (arg === '--expect-url') options.expectUrl.push(next());
    else if (arg === '--start-url') options.startUrl = next();
    else if (arg === '--origin') options.origin = next();
    else if (arg === '--max-steps') {
      const parsed = Number(next());
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100)
        throw new Error('--max-steps must be an integer between 1 and 100');
      options.maxSteps = parsed;
    } else if (arg === '--input') {
      const value = next();
      if (!parseInlineInput(value, options.inputs)) options.inputFile = value;
    } else if (arg === '--file') parseFileInput(next(), options.files);
    else if (arg === '--help' || arg === '-h') throw new Error('help');
    else throw new Error(`unknown option: ${arg}`);
  }
  if (positional.length > 1) throw new Error('only one positional instruction is allowed');
  if (positional[0] && options.promptFile)
    throw new Error('the positional instruction and --prompt-file are mutually exclusive');
  options.task = positional[0];
  if (options.plan && (options.task || options.promptFile))
    throw new Error('--plan is mutually exclusive with a positional instruction and --prompt-file');
  if (options.testName !== undefined) {
    if (!isValidTestSlug(options.testName))
      throw new Error(
        `--test-name must be a lowercase slug (a-z, 0-9 and single hyphens, e.g. cotizar-envio) of at most ${TEST_SLUG_MAX_LENGTH} characters`,
      );
    if (!options.output) throw new Error('--test-name requires --output');
    if (options.outputKind !== 'test')
      throw new Error('--test-name only applies to --output-kind test');
  }
  if (options.update && options.testName === undefined)
    throw new Error('--update requires --test-name');
  const knownInputKeys = options.inputFile ? undefined : Object.keys(options.inputs);
  for (const spec of options.expect) parseExpectation(spec, knownInputKeys);
  if (options.diff && !options.output) throw new Error('--diff requires --output');
  if (options.diff && options.dryRun)
    throw new Error('--diff and --dry-run are mutually exclusive');
  return ParsedOptions.parse(options);
}
