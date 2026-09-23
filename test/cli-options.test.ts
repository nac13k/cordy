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
    expect(() => parseCliArgs(['task', '--prompt-file', 'task.md'])).toThrow(/mutuamente/);
  });
});
