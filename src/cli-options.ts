import { z } from 'zod';

export const ParsedOptions = z.object({
  task: z.string().optional(), promptFile: z.string().optional(), inputFile: z.string().optional(), configFile: z.string().optional(), inputs: z.record(z.string(), z.string()),
  headed: z.boolean(), dryRun: z.boolean(), output: z.string().optional(), outputKind: z.enum(['test', 'automation']), expectVisible: z.array(z.string()), expectButtons: z.array(z.string()), expectUrl: z.array(z.string()), startUrl: z.string().optional(), origin: z.string().optional(), maxSteps: z.number(), json: z.boolean(), verbose: z.boolean(), approve: z.boolean(),
});
export type ParsedOptions = z.infer<typeof ParsedOptions>;

function parseInput(value: string, inputs: Record<string, string>): string | undefined {
  const separator = value.indexOf('=');
  if (separator < 1) return value;
  inputs[value.slice(0, separator)] = value.slice(separator + 1);
  return undefined;
}

export function parseCliArgs(args: string[]): ParsedOptions {
  const options: ParsedOptions = { inputs: {}, headed: false, dryRun: false, outputKind: 'test', expectVisible: [], expectButtons: [], expectUrl: [], maxSteps: 20, json: false, verbose: false, approve: false };
  const positional: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('-')) { positional.push(arg); continue; }
    const next = () => { const value = args[++index]; if (!value || value.startsWith('-')) throw new Error(`${arg} requiere un valor`); return value; };
    if (arg === '--headed') options.headed = true;
    else if (arg === '--headless') options.headed = false;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--verbose') options.verbose = true;
    else if (arg === '--approve') options.approve = true;
    else if (arg === '--prompt-file') options.promptFile = next();
    else if (arg === '--config') options.configFile = next();
    else if (arg === '--output') options.output = next();
    else if (arg === '--output-kind') { const value = next(); if (value !== 'test' && value !== 'automation') throw new Error('--output-kind debe ser test o automation'); options.outputKind = value; }
    else if (arg === '--expect-visible') options.expectVisible.push(next());
    else if (arg === '--expect-button') options.expectButtons.push(next());
    else if (arg === '--expect-url') options.expectUrl.push(next());
    else if (arg === '--start-url') options.startUrl = next();
    else if (arg === '--origin') options.origin = next();
    else if (arg === '--max-steps') { const parsed = Number(next()); if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) throw new Error('--max-steps debe ser un entero entre 1 y 100'); options.maxSteps = parsed; }
    else if (arg === '--input') { const value = next(); if (value.endsWith('.json') || value.startsWith('./') || value.startsWith('/')) options.inputFile = value; else parseInput(value, options.inputs); }
    else if (arg === '--help' || arg === '-h') throw new Error('help');
    else throw new Error(`opción desconocida: ${arg}`);
  }
  if (positional.length > 1) throw new Error('solo se permite una instrucción posicional');
  if (positional[0] && options.promptFile) throw new Error('la instrucción posicional y --prompt-file son mutuamente excluyentes');
  options.task = positional[0];
  return ParsedOptions.parse(options);
}
