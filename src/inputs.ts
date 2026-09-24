import { accessSync, constants, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ParsedOptions } from './cli-options.js';

export type ProvidedInputs = {
  values: Record<string, string>;
  files: Record<string, string[]>;
};

export function loadPrompt(options: ParsedOptions): string {
  if (options.promptFile) return readFileSync(options.promptFile, 'utf8').trim();
  if (options.task?.trim()) return options.task.trim();
  throw new Error('provide an instruction or --prompt-file');
}

function fileEntryPaths(key: string, value: object): string[] {
  const entry = value as { type?: unknown; path?: unknown; paths?: unknown };
  const keys = Object.keys(entry).sort().join(',');
  if (entry.type === 'file' && keys === 'path,type' && typeof entry.path === 'string')
    return [entry.path];
  if (
    entry.type === 'file' &&
    keys === 'paths,type' &&
    Array.isArray(entry.paths) &&
    entry.paths.length > 0 &&
    entry.paths.every((path) => typeof path === 'string')
  )
    return entry.paths as string[];
  throw new Error(
    `invalid input: ${key} (objects must be { "type": "file", "path": "..." } or { "type": "file", "paths": [...] })`,
  );
}

function assertReadableFile(key: string, path: string, cwd: string) {
  const absolute = resolve(cwd, path);
  try {
    if (!path.trim() || !statSync(absolute).isFile()) throw new Error('not a file');
    accessSync(absolute, constants.R_OK);
  } catch {
    throw new Error(`file input ${key}: ${path} is not a readable file`);
  }
}

export function loadInputs(options: ParsedOptions, cwd = process.cwd()): ProvidedInputs {
  const values = { ...options.inputs };
  const files: Record<string, string[]> = {};
  if (options.inputFile) {
    const parsed = JSON.parse(readFileSync(options.inputFile, 'utf8')) as Record<string, unknown>;
    for (const [key, value] of Object.entries(parsed)) {
      if (value !== null && typeof value === 'object') files[key] = fileEntryPaths(key, value);
      else if (['string', 'number', 'boolean'].includes(typeof value)) values[key] = String(value);
      else throw new Error(`invalid input: ${key}`);
    }
  }
  Object.assign(files, options.files);
  for (const key of Object.keys(files)) {
    if (Object.prototype.hasOwnProperty.call(values, key))
      throw new Error(`input ${key} is provided both as a value and as a file`);
    for (const path of files[key]) assertReadableFile(key, path, cwd);
  }
  return { values, files };
}
