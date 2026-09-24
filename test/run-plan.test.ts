import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseCliArgs } from '../src/cli-options.js';
import { runCordy } from '../src/run.js';

describe('plan file runs', () => {
  let dir: string;
  let startUrl: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cordy-plan-'));
    const page = join(dir, 'page.html');
    await writeFile(page, '<label>Name<input></label><label>Email<input></label>');
    startUrl = pathToFileURL(page).href;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const fakeJev = (
    answers: Array<Record<string, string>>,
    classifications: Array<Record<string, string>> = [],
  ) => {
    vi.stubEnv('JEV_API_KEY', 'test-only');
    const queue = [...answers];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        const questions = Object.keys(JSON.parse(String(init?.body)).questions);
        const next = questions[0]?.startsWith('step_')
          ? (classifications.shift() ?? {})
          : (queue.shift() ?? { action: 'needs_review' });
        return new Response(
          JSON.stringify({
            answers: Object.fromEntries(
              Object.entries(next).map(([key, choice]) => [key, { choice }]),
            ),
          }),
        );
      }),
    );
  };
  const writePlan = async (content: string) => {
    const file = join(dir, `plan-${Math.random()}.yaml`);
    await writeFile(file, content);
    return file;
  };

  it('runs explicit steps in order, waits for load, and fails on unused inputs', async () => {
    fakeJev([{ action: 'fill', target: 'el_1', input_key: 'name' }]);
    const output = join(dir, 'flow.spec.ts');
    await writeFile(output, '');
    const plan = await writePlan('version: 1\nsteps:\n  - fill: [name]\n  - wait: load\n');
    const result = await runCordy(
      parseCliArgs([
        '--plan',
        plan,
        '--start-url',
        startUrl,
        '--input',
        'name=Ana',
        '--input',
        'phone=555',
        '--output',
        output,
        '--test-name',
        'signup',
      ]),
    );
    expect(result.actions.map((record) => [record.action.kind, record.status])).toEqual([
      ['fill', 'succeeded'],
      ['wait', 'succeeded'],
    ]);
    expect(result.errors).toEqual(['The plan finished without using these inputs: phone']);
    expect(result.planSteps?.map((step) => step.kind)).toEqual(['fill', 'wait']);
    expect(await readFile(output, 'utf8')).toBe('');
  }, 30_000);

  it('reports the first incomplete step when the step limit is reached', async () => {
    fakeJev([{ action: 'fill', target: 'el_1', input_key: 'name' }]);
    const plan = await writePlan('version: 1\nsteps:\n  - fill: [name]\n  - fill: [email]\n');
    const result = await runCordy(
      parseCliArgs([
        '--plan',
        plan,
        '--start-url',
        startUrl,
        '--input',
        'name=Ana',
        '--input',
        'email=ana@example.test',
        '--max-steps',
        '1',
      ]),
    );
    expect(result.errors).toEqual(['Plan step 2 (fill) was not completed']);
  }, 30_000);

  it('walks a two-screen wizard from natural-language steps', async () => {
    const page = join(dir, 'wizard.html');
    await writeFile(
      page,
      `<div id="s1"><label>Nombre<input id="name"></label><label>Correo<input id="email"></label>
       <button onclick="s1.hidden = true; s2.hidden = false">Siguiente</button></div>
       <div id="s2" hidden><label>Teléfono<input id="phone"></label>
       <button onclick="document.title = 'sent'">Enviar</button></div>`,
    );
    fakeJev(
      [
        { action: 'fill', target: 'el_1', input_key: 'name' },
        { action: 'fill', target: 'el_2', input_key: 'email' },
        { action: 'fill', target: 'el_1', input_key: 'none' },
        { action: 'click', target: 'el_3', input_key: 'none' },
        { action: 'fill', target: 'el_4', input_key: 'phone' },
        { action: 'click', target: 'el_5', input_key: 'none' },
      ],
      [{ step_0: 'fill', step_1: 'click', step_2: 'fill', step_3: 'submit' }],
    );
    // Spanish step texts on purpose: plan steps may be written in any language.
    const plan = await writePlan(
      'version: 1\nsteps:\n  - llena el formulario\n  - clic en siguiente\n  - llena el formulario\n  - clic en "Enviar"\n',
    );
    const result = await runCordy(
      parseCliArgs([
        '--plan',
        plan,
        '--start-url',
        pathToFileURL(page).href,
        '--input',
        'name=Ana',
        '--input',
        'email=ana@example.test',
        '--input',
        'phone=5550000',
        '--approve',
        '--expect',
        'title:sent',
      ]),
    );
    expect(result.actions.map((record) => [record.action.kind, record.status])).toEqual([
      ['fill', 'succeeded'],
      ['fill', 'succeeded'],
      ['step_complete', 'succeeded'],
      ['click', 'succeeded'],
      ['fill', 'succeeded'],
      ['click', 'succeeded'],
    ]);
    expect(result.actions[5].action).toMatchObject({ highImpact: true });
    expect(result.errors).toBeUndefined();
    expect(result.expectations.map((item) => item.status)).toEqual(['passed']);
    expect(result.planSteps).toEqual([
      {
        step: 1,
        text: 'llena el formulario',
        kind: 'fill',
        source: 'classified',
        status: 'done',
        keys: ['name', 'email'],
      },
      {
        step: 2,
        text: 'clic en siguiente',
        kind: 'click',
        source: 'classified',
        status: 'done',
        target: 'getByRole:button:Siguiente',
      },
      expect.objectContaining({ step: 3, keys: ['phone'], status: 'done' }),
      expect.objectContaining({ step: 4, kind: 'submit', status: 'done' }),
    ]);
  }, 60_000);

  it('blocks a submit click without --approve', async () => {
    fakeJev([{ action: 'click', target: 'el_3', input_key: 'none' }]);
    const page = join(dir, 'submit.html');
    await writeFile(
      page,
      '<label>Name<input value="x"></label><label>Email<input value="y"></label><button>Send</button>',
    );
    const plan = await writePlan('version: 1\nsteps:\n  - submit: Send\n');
    const result = await runCordy(
      parseCliArgs(['--plan', plan, '--start-url', pathToFileURL(page).href]),
    );
    expect(result.actions).toEqual([
      expect.objectContaining({ status: 'blocked', error: 'requires --approve' }),
    ]);
  }, 30_000);

  it('blocks the final click of a prompt-derived run without --approve', async () => {
    const page = join(dir, 'simulate.html');
    await writeFile(page, '<label>Monto<input id="amount"></label><button>Simular</button>');
    fakeJev([
      { action: 'fill', target: 'el_1', input_key: 'monto' },
      { action: 'click', target: 'el_2', input_key: 'none' },
    ]);
    // Spanish prompt on purpose: the regex planner derives fill + final "simular" click from it.
    const result = await runCordy(
      parseCliArgs([
        'llena el formulario y simula el credito',
        '--start-url',
        pathToFileURL(page).href,
        '--input',
        'monto=1000',
      ]),
    );
    expect(result.actions.map((record) => [record.action.kind, record.status])).toEqual([
      ['fill', 'succeeded'],
      ['click', 'blocked'],
    ]);
    expect(result.actions[1].error).toBe('requires --approve');
  }, 30_000);

  it('describes every step in a dry run and warns about values in step texts', async () => {
    fakeJev([], [{ step_0: 'fill', step_1: 'wait' }]);
    // Spanish step texts on purpose: plan steps may be written in any language.
    const plan = await writePlan(
      'version: 1\nsteps:\n  - llena monto con 10000\n  - espera carga 3 segundos\n  - submit: Send\n  - fill: [name]\n',
    );
    const result = await runCordy(
      parseCliArgs(['--plan', plan, '--start-url', startUrl, '--input', 'name=Ana', '--dry-run']),
    );
    expect(result.planSteps).toEqual([
      expect.objectContaining({
        step: 1,
        text: 'llena monto con 10000',
        kind: 'fill',
        source: 'classified',
      }),
      expect.objectContaining({
        step: 2,
        kind: 'wait',
        note: 'waits for the page load event; any duration in the text is ignored',
      }),
      expect.objectContaining({
        step: 3,
        text: 'submit: Send',
        kind: 'submit',
        source: 'explicit',
      }),
      expect.objectContaining({ step: 4, text: 'fill: [name]', kind: 'fill' }),
    ]);
    expect(result.warnings).toEqual([
      expect.stringMatching(/^Plan step 1 \("llena monto con 10000"\) may contain an input value/),
    ]);
    expect(result.errors).toBeUndefined();
  }, 30_000);

  describe('prompt runs end with their derived steps', () => {
    const quotePage = async () => {
      const page = join(dir, 'quote.html');
      await writeFile(page, '<label>Peso<input id="peso"></label><button>Simulate</button>');
      return pathToFileURL(page).href;
    };
    const jevCalls = () =>
      (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls;

    it('stops after the fill when the prompt only derives a fill step', async () => {
      fakeJev([
        { action: 'fill', target: 'el_1', input_key: 'peso' },
        { action: 'click', target: 'el_2', input_key: 'none' },
      ]);
      // Spanish prompt on purpose: the planner derives only a fill step from it.
      const result = await runCordy(
        parseCliArgs([
          'llena el formulario',
          '--start-url',
          await quotePage(),
          '--input',
          'peso=2',
        ]),
      );
      expect(result.actions.map((record) => [record.action.kind, record.status])).toEqual([
        ['fill', 'succeeded'],
      ]);
      expect(jevCalls()).toHaveLength(1);
      expect(result.errors).toBeUndefined();
    }, 30_000);

    it('never clicks Simulate for an English prompt that only yields a fill step', async () => {
      fakeJev([
        { action: 'fill', target: 'el_1', input_key: 'peso' },
        { action: 'click', target: 'el_2', input_key: 'none' },
      ]);
      const result = await runCordy(
        parseCliArgs([
          'Go to the shipping quote section, fill in the form, and click Simulate.',
          '--start-url',
          await quotePage(),
          '--input',
          'peso=2',
        ]),
      );
      expect(result.actions.map((record) => record.action.kind)).toEqual(['fill']);
      expect(jevCalls()).toHaveLength(1);
    }, 30_000);

    it('fails when the step limit ends the run before the derived steps are complete', async () => {
      fakeJev([{ action: 'fill', target: 'el_1', input_key: 'peso' }]);
      // Spanish prompt on purpose: the planner derives a fill step and a final "simular" click.
      const result = await runCordy(
        parseCliArgs([
          'llena el formulario y simula',
          '--start-url',
          await quotePage(),
          '--input',
          'peso=2',
          '--max-steps',
          '1',
        ]),
      );
      expect(result.errors).toEqual([
        'Prompt step 2 (submit: simular) was not completed within --max-steps',
      ]);
    }, 30_000);

    it('reports no step-limit error when the run stops on a blocked click', async () => {
      fakeJev([
        { action: 'fill', target: 'el_1', input_key: 'peso' },
        { action: 'click', target: 'el_2', input_key: 'none' },
      ]);
      const result = await runCordy(
        parseCliArgs([
          'llena el formulario y simula',
          '--start-url',
          await quotePage(),
          '--input',
          'peso=2',
        ]),
      );
      expect(result.actions.at(-1)).toMatchObject({ status: 'blocked' });
      expect(result.errors).toBeUndefined();
    }, 30_000);
  });

  it('blocks a click on an English submission button in a plan step without --approve', async () => {
    const page = join(dir, 'simulate.html');
    await writeFile(page, '<button>Simulate</button>');
    fakeJev([{ action: 'click', target: 'el_1', input_key: 'none' }], [{ step_0: 'click' }]);
    // Spanish step text on purpose: plan steps may be written in any language.
    const plan = await writePlan('version: 1\nsteps:\n  - clic en "Simulate"\n');
    const result = await runCordy(
      parseCliArgs(['--plan', plan, '--start-url', pathToFileURL(page).href]),
    );
    expect(result.actions).toEqual([
      expect.objectContaining({
        action: expect.objectContaining({ kind: 'click', highImpact: true }),
        status: 'blocked',
        error: 'requires --approve',
      }),
    ]);
  }, 30_000);
});
