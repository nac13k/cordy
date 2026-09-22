import { readFileSync } from 'node:fs';
import type { ParsedOptions } from './cli-options.js';

export function loadPrompt(options: ParsedOptions): string {
  if (options.promptFile) return readFileSync(options.promptFile, 'utf8').trim();
  if (options.task?.trim()) return options.task.trim();
  throw new Error('proporciona una instrucción o --prompt-file');
}

export function loadInputs(options: ParsedOptions): Record<string, string> {
  const inputs = { ...options.inputs };
  if (!options.inputFile) return inputs;
  const parsed = JSON.parse(readFileSync(options.inputFile, 'utf8')) as Record<string, unknown>;
  for (const [key, value] of Object.entries(parsed)) {
    if (!['string', 'number', 'boolean'].includes(typeof value)) throw new Error(`input inválido: ${key}`);
    inputs[key] = String(value);
  }
  return inputs;
}
