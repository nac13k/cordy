import { readFileSync } from 'node:fs';
import type { ParsedOptions } from './cli-options.js';

export function loadPrompt(options: ParsedOptions): string {
  if (options.promptFile) return readFileSync(options.promptFile, 'utf8').trim();
  if (options.task?.trim()) return options.task.trim();
  throw new Error('provide an instruction or --prompt-file');
}

export function loadInputs(options: ParsedOptions): Record<string, string> {
  const inputs = { ...options.inputs };
  if (!options.inputFile) return inputs;
  const parsed = JSON.parse(readFileSync(options.inputFile, 'utf8')) as Record<string, unknown>;
  for (const [key, value] of Object.entries(parsed)) {
    if (!['string', 'number', 'boolean'].includes(typeof value))
      throw new Error(`invalid input: ${key}`);
    inputs[key] = String(value);
  }
  return inputs;
}
