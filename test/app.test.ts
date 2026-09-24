import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runCordy = vi.fn();
const launch = vi.fn();
vi.mock('../src/run.js', () => ({ runCordy }));
vi.mock('@playwright/test', () => ({ chromium: { launch } }));

const { main } = await import('../src/app.js');

const block = (slug: string) =>
  `// cordy:begin ${slug}\ntest('${slug}', async () => {});\n// cordy:end ${slug}`;

describe('cordy CLI app', () => {
  let dir: string;
  let stdout: string[];
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cordy-app-'));
    stdout = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => stdout.push(args.join(' ')));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });
  });
  afterEach(() => vi.restoreAllMocks());

  const fixture = async (content: string) => {
    const file = join(dir, 'flows.spec.ts');
    await writeFile(file, content, 'utf8');
    return file;
  };

  it('lists managed tests with line ranges', async () => {
    const file = await fixture(`import x;\n\n${block('cotizar-envio')}\n\n${block('login')}\n`);
    expect(await main(['tests', file])).toBe(0);
    expect(stdout.join('\n')).toMatch(/cotizar-envio\s+3-5\s+ok/);
    expect(stdout.join('\n')).toMatch(/login\s+7-9\s+ok/);
    expect(launch).not.toHaveBeenCalled();
  });

  it('reports files without managed tests', async () => {
    const file = await fixture("test('manual', async () => {});\n");
    expect(await main(['tests', file])).toBe(0);
    expect(stdout.join('\n')).toMatch(/No Cordy-managed tests/);
  });

  it('exits 1 and reports malformed markers', async () => {
    const file = await fixture(`${block('login')}\n// cordy:begin checkout\n`);
    expect(await main(['tests', file])).toBe(1);
    expect(stdout.join('\n')).toMatch(/checkout\s+4-\?\s+missing 'cordy:end checkout' \(line 4\)/);
  });

  it('prints JSON only with --json', async () => {
    const file = await fixture(`${block('login')}\n`);
    expect(await main(['tests', file, '--json'])).toBe(0);
    expect(JSON.parse(stdout.join('\n'))).toMatchObject({
      tests: [{ slug: 'login', startLine: 1, endLine: 3, status: 'ok', problems: [] }],
      problems: [],
    });
  });

  it('exits 1 for a missing file', async () => {
    expect(await main(['tests', join(dir, 'missing.spec.ts')])).toBe(1);
    expect(await main(['tests'])).toBe(1);
  });

  it('keeps stdout as a single JSON document containing the diff', async () => {
    runCordy.mockResolvedValue({
      actions: [],
      expectations: [],
      output: { file: 'f.spec.ts', written: false, message: '--diff: f.spec.ts was not written' },
      diff: '--- f.spec.ts\n+++ f.spec.ts\n',
    });
    await main(['task', '--output', 'f.spec.ts', '--diff', '--json']);
    expect(JSON.parse(stdout.join('\n'))).toMatchObject({ diff: '--- f.spec.ts\n+++ f.spec.ts\n' });
  });

  it('prints the diff and output message as text without --json', async () => {
    runCordy.mockResolvedValue({
      actions: [],
      expectations: [],
      output: { file: 'f.spec.ts', written: false, message: '--diff: f.spec.ts was not written' },
      diff: '--- f.spec.ts\n+++ f.spec.ts\n',
    });
    await main(['task', '--output', 'f.spec.ts', '--diff']);
    expect(stdout[0]).toBe('--- f.spec.ts\n+++ f.spec.ts\n');
    expect(stdout[1]).toBe('--diff: f.spec.ts was not written');
  });

  describe('plan subcommands', () => {
    let stderr: string[];
    beforeEach(() => {
      stderr = [];
      vi.spyOn(console, 'error').mockImplementation((...args) => stderr.push(args.join(' ')));
    });
    it('writes a template once and refuses to overwrite it', async () => {
      const file = join(dir, 'plan.yaml');
      expect(await main(['plan', 'init', file])).toBe(0);
      const template = await readFile(file, 'utf8');
      await writeFile(file, 'mine', 'utf8');
      expect(await main(['plan', 'init', file])).toBe(1);
      expect(await readFile(file, 'utf8')).toBe('mine');
      expect(stderr.join('\n')).toMatch(/already exists/);
      expect(template).toContain('version: 1');
    });
    it('prints a JSON Schema that accepts the init template', async () => {
      expect(await main(['plan', 'schema'])).toBe(0);
      const schema = JSON.parse(stdout.join(''));
      expect(schema).toMatchObject({ type: 'object', required: ['version', 'steps'] });
    });
    it('checks a plan offline without a Jev key', async () => {
      vi.stubEnv('JEV_API_KEY', '');
      const valid = join(dir, 'valid.yaml');
      await writeFile(valid, 'version: 1\nsteps:\n  - open signup\n  - submit: Send\n', 'utf8');
      expect(await main(['plan', 'check', valid])).toBe(0);
      expect(stdout.join('\n')).toMatch(/Plan is valid: 2 step/);
      const invalid = join(dir, 'invalid.yaml');
      await writeFile(invalid, 'version: 1\nsteps:\n  - a\n  - a\n  - { fill: amount }\n', 'utf8');
      expect(await main(['plan', 'check', invalid])).toBe(1);
      expect(stderr.join('\n')).toMatch(/steps\[2\]\.fill: expected a list of input keys/);
      expect(runCordy).not.toHaveBeenCalled();
      expect(launch).not.toHaveBeenCalled();
      vi.unstubAllEnvs();
    });
  });
});
