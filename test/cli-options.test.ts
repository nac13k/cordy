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
  it('parses key=value inputs even when the value looks like a path', () => {
    const parsed = parseCliArgs([
      'task',
      '--input',
      'report=./data/report.json',
      '--input',
      'root=/abs/path',
      '--input',
      'query=a=b',
    ]);
    expect(parsed.inputs).toEqual({
      report: './data/report.json',
      root: '/abs/path',
      query: 'a=b',
    });
    expect(parsed.inputFile).toBeUndefined();
  });
  it('treats arguments without a valid key prefix as the inputs file', () => {
    expect(parseCliArgs(['task', '--input', '/abs/inputs.json']).inputFile).toBe(
      '/abs/inputs.json',
    );
    expect(parseCliArgs(['task', '--input', './a=b.json']).inputFile).toBe('./a=b.json');
  });
  it('parses repeated file inputs with one or several paths', () => {
    expect(
      parseCliArgs([
        'task',
        '--file',
        'id_document=./fixtures/id.pdf',
        '--file',
        'attachments=./a.pdf,./b.pdf',
      ]).files,
    ).toEqual({ id_document: ['./fixtures/id.pdf'], attachments: ['./a.pdf', './b.pdf'] });
  });
  it('rejects file inputs without a key or with empty paths', () => {
    expect(() => parseCliArgs(['task', '--file', './a.pdf'])).toThrow(/key=path/);
    expect(() => parseCliArgs(['task', '--file', 'doc='])).toThrow(/non-empty path/);
    expect(() => parseCliArgs(['task', '--file', 'doc=./a.pdf,'])).toThrow(/non-empty path/);
  });
  it('parses repeated --expect specs', () => {
    expect(
      parseCliArgs([
        'task',
        '--input',
        'amount=10',
        '--expect',
        'text:${input.amount}',
        '--expect',
        'not-text:/error/i',
      ]).expect,
    ).toEqual(['text:${input.amount}', 'not-text:/error/i']);
  });
  it('rejects an unknown expectation kind', () => {
    expect(() => parseCliArgs(['task', '--expect', 'visible:Summary'])).toThrow(
      /invalid --expect "visible:Summary": unknown kind/,
    );
  });
  it('rejects an unknown input reference when all inputs are inline', () => {
    expect(() =>
      parseCliArgs(['task', '--input', 'a=1', '--expect', 'text:${input.missing}']),
    ).toThrow(/references input "missing"/);
    expect(
      parseCliArgs(['task', '--input', './inputs.json', '--expect', 'text:${input.fromFile}'])
        .expect,
    ).toEqual(['text:${input.fromFile}']);
  });
  it('accepts --plan with a path or - for stdin', () => {
    expect(parseCliArgs(['--plan', 'plan.yaml']).plan).toBe('plan.yaml');
    expect(parseCliArgs(['--plan', '-', '--headed'])).toMatchObject({ plan: '-', headed: true });
    expect(() => parseCliArgs(['--plan', '--headed'])).toThrow(/--plan requires/);
  });
  it('rejects --plan together with a prompt', () => {
    expect(() => parseCliArgs(['task', '--plan', 'plan.yaml'])).toThrow(/mutually exclusive/);
    expect(() => parseCliArgs(['--prompt-file', 't.md', '--plan', 'plan.yaml'])).toThrow(
      /mutually exclusive/,
    );
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
