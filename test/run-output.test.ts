import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const launch = vi.fn();
vi.mock('@playwright/test', () => ({ chromium: { launch } }));

const { parseCliArgs } = await import('../src/cli-options.js');
const { runCordy } = await import('../src/run.js');

const existing = "// cordy:begin login\ntest('login', async () => {});\n// cordy:end login\n";

describe('managed output preflight', () => {
  let file: string;
  beforeEach(async () => {
    launch.mockReset();
    launch.mockRejectedValue(new Error('browser must not launch'));
    file = join(await mkdtemp(join(tmpdir(), 'cordy-')), 'flows.spec.ts');
    await writeFile(file, existing, 'utf8');
  });
  const run = (...flags: string[]) =>
    runCordy(
      parseCliArgs([
        'entra a la sección cotizador de envíos y llena el formulario',
        '--input',
        'monto=1',
        '--start-url',
        'https://example.test',
        '--output',
        file,
        ...flags,
      ]),
    );

  it('fails on an existing slug before launching the browser', async () => {
    await expect(run('--test-name', 'login')).rejects.toThrow(/--update/);
    expect(launch).not.toHaveBeenCalled();
  });

  it('fails on --update for a missing slug before launching the browser', async () => {
    await expect(run('--test-name', 'checkout', '--update')).rejects.toThrow(/does not exist/);
    expect(launch).not.toHaveBeenCalled();
  });

  it('fails on malformed markers before launching the browser', async () => {
    await writeFile(file, '// cordy:begin login\n', 'utf8');
    await expect(run('--test-name', 'other')).rejects.toThrow(/malformed/);
    expect(launch).not.toHaveBeenCalled();
    expect(await readFile(file, 'utf8')).toBe('// cordy:begin login\n');
  });

  it('launches the browser when the plan is valid', async () => {
    await expect(run('--test-name', 'login', '--update')).rejects.toThrow(/must not launch/);
    expect(launch).toHaveBeenCalledOnce();
  });

  it('rejects expectations that reference inputs missing from the inputs file before launch', async () => {
    const inputs = join(file, '..', 'inputs.json');
    await writeFile(inputs, JSON.stringify({ monto: '1' }), 'utf8');
    await expect(
      runCordy(
        parseCliArgs([
          'llena el formulario',
          '--input',
          inputs,
          '--start-url',
          'https://example.test',
          '--expect',
          'text:${input.missing}',
        ]),
      ),
    ).rejects.toThrow(/references input "missing"/);
    expect(launch).not.toHaveBeenCalled();
  });

  it('stops before launching the browser when a plan step is compound', async () => {
    const plan = join(file, '..', 'plan.yaml');
    // Spanish step on purpose: plan steps may be written in any language.
    await writeFile(plan, 'version: 1\nsteps:\n  - llena el formulario y da clic en enviar\n');
    vi.stubEnv('JEV_API_KEY', 'test-only');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ answers: { step_0: { choice: 'compound' } } })),
      ),
    );
    await expect(
      runCordy(parseCliArgs(['--plan', plan, '--start-url', 'https://example.test'])),
    ).rejects.toThrow(/Plan step 1 .* describes more than one action/);
    expect(launch).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
});
