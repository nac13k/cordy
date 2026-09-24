import { describe, expect, it } from 'vitest';
import { parseCliArgs } from '../src/cli-options.js';

describe('cordy CLI options', () => {
  it('parses repeated expectations and output kind', () => {
    const parsed = parseCliArgs([
      'task',
      '--output',
      'flow.tsx',
      '--output-kind',
      'test',
      '--expect-visible',
      'Resumen del envío',
      '--expect-url',
      'https://example.test/result',
    ]);
    expect(parsed.outputKind).toBe('test');
    expect(parsed.expectVisible).toEqual(['Resumen del envío']);
    expect(parsed.expectUrl).toEqual(['https://example.test/result']);
  });

  it('parses task, repeated inputs and headed mode', () => {
    expect(
      parseCliArgs([
        'Completa el registro',
        '--input',
        'name=Ana',
        '--input',
        'age=34',
        '--headed',
      ]),
    ).toMatchObject({
      task: 'Completa el registro',
      inputs: { name: 'Ana', age: '34' },
      headed: true,
    });
  });
  it('supports a prompt file and JSON input path', () => {
    expect(parseCliArgs(['--prompt-file', 'task.md', '--input', './inputs.json'])).toMatchObject({
      promptFile: 'task.md',
      inputFile: './inputs.json',
    });
  });
  it('rejects both positional task and prompt file', () => {
    expect(() => parseCliArgs(['task', '--prompt-file', 'task.md'])).toThrow(/mutually exclusive/);
  });

  it('parses managed test flags', () => {
    expect(
      parseCliArgs([
        'task',
        '--output',
        'flows.spec.ts',
        '--test-name',
        'login',
        '--update',
        '--diff',
      ]),
    ).toMatchObject({ testName: 'login', update: true, diff: true });
  });
  it('rejects invalid test slugs', () => {
    expect(() =>
      parseCliArgs(['task', '--output', 'f.spec.ts', '--test-name', 'Cotizar_Envio']),
    ).toThrow(/slug/);
    expect(() =>
      parseCliArgs(['task', '--output', 'f.spec.ts', '--test-name', 'a'.repeat(65)]),
    ).toThrow(/slug/);
  });
  it('requires --output and test output kind for --test-name', () => {
    expect(() => parseCliArgs(['task', '--test-name', 'login'])).toThrow(/requires --output/);
    expect(() =>
      parseCliArgs([
        'task',
        '--output',
        'f.ts',
        '--output-kind',
        'automation',
        '--test-name',
        'login',
      ]),
    ).toThrow(/--output-kind test/);
  });
  it('requires --test-name for --update', () => {
    expect(() => parseCliArgs(['task', '--output', 'f.spec.ts', '--update'])).toThrow(
      /--update requires --test-name/,
    );
  });
  it('validates --diff combinations', () => {
    expect(() => parseCliArgs(['task', '--diff'])).toThrow(/--diff requires --output/);
    expect(() => parseCliArgs(['task', '--output', 'f.spec.ts', '--diff', '--dry-run'])).toThrow(
      /mutually exclusive/,
    );
  });
});
