import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseCliArgs } from '../src/cli-options.js';
import { runCordy, unsuccessfulRunReason } from '../src/run.js';

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

  describe('prompt step lists', () => {
    const quotePage = async () => {
      const page = join(dir, 'quote.html');
      await writeFile(
        page,
        '<button>Shipping quote</button><label>Peso<input id="peso"></label><button>Simulate</button><button>Download receipt</button>',
      );
      return pathToFileURL(page).href;
    };
    const requests = () =>
      (globalThis.fetch as unknown as { mock: { calls: [unknown, RequestInit][] } }).mock.calls.map(
        ([, init]) => JSON.parse(String(init.body)),
      );
    const kinds = (result: Awaited<ReturnType<typeof runCordy>>) =>
      result.actions.map((record) => [record.action.kind, record.status]);

    it('runs an English list with plan semantics and sends the prompt as the task', async () => {
      fakeJev(
        [
          { action: 'click', target: 'el_1', input_key: 'none' },
          { action: 'fill', target: 'el_2', input_key: 'peso' },
          { action: 'click', target: 'el_3', input_key: 'none' },
        ],
        [{ step_0: 'click', step_1: 'fill', step_2: 'submit' }],
      );
      const prompt = 'Open "Shipping quote", fill in the form, click "Simulate"';
      const result = await runCordy(
        parseCliArgs([prompt, '--start-url', await quotePage(), '--input', 'peso=2', '--approve']),
      );
      expect(kinds(result)).toEqual([
        ['click', 'succeeded'],
        ['fill', 'succeeded'],
        ['click', 'succeeded'],
      ]);
      expect(result.errors).toBeUndefined();
      expect(result.planSteps.map((step) => [step.text, step.kind, step.status])).toEqual([
        ['Open "Shipping quote"', 'click', 'done'],
        ['fill in the form', 'fill', 'done'],
        ['click "Simulate"', 'submit', 'done'],
      ]);
      expect(requests()[0].state.task).toBe(prompt);
    }, 60_000);

    // Spanish steps on purpose: they replay a real run against fixture/index.html.
    const fixtureUrl = new URL('../fixture/index.html', import.meta.url).href;

    it('keeps each quoted fill step on the field it names', async () => {
      fakeJev(
        [
          { action: 'fill', target: 'el_1', input_key: 'name' },
          { action: 'fill', target: 'el_2', input_key: 'email' },
          { action: 'fill', target: 'el_2', input_key: 'email' },
          { action: 'click', target: 'el_3', input_key: 'none' },
        ],
        [{ step_0: 'fill', step_1: 'fill', step_2: 'click' }],
      );
      const result = await runCordy(
        parseCliArgs([
          'Llena "Nombre completo", llena "Correo electrónico", da click en "Crear cuenta"',
          '--start-url',
          fixtureUrl,
          '--input',
          'name=Ana',
          '--input',
          'email=ana@example.test',
        ]),
      );
      expect(kinds(result)).toEqual([
        ['fill', 'succeeded'],
        ['step_complete', 'succeeded'],
        ['fill', 'succeeded'],
        ['click', 'succeeded'],
      ]);
      expect(result.errors).toBeUndefined();
      expect(result.planSteps).toEqual([
        expect.objectContaining({ step: 1, status: 'done', keys: ['name'] }),
        expect.objectContaining({ step: 2, status: 'done', keys: ['email'] }),
        expect.objectContaining({ step: 3, status: 'done' }),
      ]);
    }, 60_000);

    it('stops when a quoted fill step starts on a field it does not name', async () => {
      fakeJev([{ action: 'fill', target: 'el_1', input_key: 'email' }], [{ step_0: 'fill' }]);
      const result = await runCordy(
        parseCliArgs([
          'llena "Correo electrónico"',
          '--start-url',
          fixtureUrl,
          '--input',
          'email=ana@example.test',
        ]),
      );
      expect(result.actions).toEqual([
        {
          action: {
            kind: 'needs_review',
            reason: 'Field "Nombre completo" is not named in the step "llena "Correo electrónico""',
          },
          status: 'blocked',
          error: expect.any(String),
        },
      ]);
      expect(result.planSteps[0]).toMatchObject({ status: 'pending' });
    }, 60_000);

    it('continues after an approved submit until the last step', async () => {
      fakeJev(
        [
          { action: 'fill', target: 'el_2', input_key: 'peso' },
          { action: 'click', target: 'el_3', input_key: 'none' },
          { action: 'click', target: 'el_4', input_key: 'none' },
        ],
        [{ step_0: 'fill', step_1: 'submit', step_2: 'click' }],
      );
      // Spanish step texts on purpose: prompt steps may be written in any language.
      const result = await runCordy(
        parseCliArgs([
          '1. llena el formulario 2. envía con "Simulate" 3. clic en "Download receipt"',
          '--start-url',
          await quotePage(),
          '--input',
          'peso=2',
          '--approve',
        ]),
      );
      expect(kinds(result)).toEqual([
        ['fill', 'succeeded'],
        ['click', 'succeeded'],
        ['click', 'succeeded'],
      ]);
      expect(result.errors).toBeUndefined();
    }, 60_000);

    it('blocks a submit step without --approve and says why the output was not written', async () => {
      const output = join(dir, 'blocked.spec.ts');
      await writeFile(output, '');
      fakeJev(
        [
          { action: 'fill', target: 'el_2', input_key: 'peso' },
          { action: 'click', target: 'el_3', input_key: 'none' },
        ],
        [{ step_0: 'fill', step_1: 'submit' }],
      );
      const result = await runCordy(
        parseCliArgs([
          '- fill in the form\n- click "Simulate"',
          '--start-url',
          await quotePage(),
          '--input',
          'peso=2',
          '--output',
          output,
          '--test-name',
          'quote',
        ]),
      );
      expect(kinds(result)).toEqual([
        ['fill', 'succeeded'],
        ['click', 'blocked'],
      ]);
      expect(result.actions[1].error).toBe('requires --approve');
      expect(result.output).toEqual({
        file: output,
        written: false,
        message: `${output} left unchanged: step 2 ("click "Simulate"") was blocked: requires --approve; rerun with --approve to allow it`,
      });
      expect(await readFile(output, 'utf8')).toBe('');
    }, 30_000);

    it('fails when an input is not used', async () => {
      fakeJev([{ action: 'click', target: 'el_1', input_key: 'none' }], [{ step_0: 'click' }]);
      const result = await runCordy(
        parseCliArgs([
          'Open "Shipping quote"',
          '--start-url',
          await quotePage(),
          '--input',
          'peso=2',
        ]),
      );
      expect(result.errors).toEqual(['The plan finished without using these inputs: peso']);
    }, 30_000);

    it('fails when --max-steps ends the run before the last step', async () => {
      fakeJev(
        [{ action: 'fill', target: 'el_2', input_key: 'peso' }],
        [{ step_0: 'fill', step_1: 'submit' }],
      );
      const result = await runCordy(
        parseCliArgs([
          'fill in the form, click "Simulate"',
          '--start-url',
          await quotePage(),
          '--input',
          'peso=2',
          '--max-steps',
          '1',
        ]),
      );
      expect(result.errors).toEqual(['Plan step 2 ("click "Simulate"") was not completed']);
    }, 30_000);

    it('rejects a compound step before launching the browser', async () => {
      fakeJev([], [{ step_0: 'click', step_1: 'compound' }]);
      // Spanish prompt on purpose: the former regex-planner example is now a compound step.
      await expect(
        runCordy(
          parseCliArgs([
            'Entra a la sección cotizador de envíos, llena el formulario y simula.',
            '--start-url',
            await quotePage(),
            '--input',
            'peso=2',
          ]),
        ),
      ).rejects.toThrow(
        /Plan step 2 \("llena el formulario y simula"\) describes more than one action/,
      );
      expect(requests()).toHaveLength(1);
    }, 30_000);

    it('warns about values in prompt steps and infers no expectations', async () => {
      fakeJev([], [{ step_0: 'fill', step_1: 'click' }]);
      // Spanish prompt on purpose: "botón de …" was inferred as an expectation before.
      const result = await runCordy(
        parseCliArgs([
          'llena el correo con ana@example.test, clic en el botón de guardar cotización',
          '--start-url',
          await quotePage(),
          '--dry-run',
        ]),
      );
      expect(result.warnings).toEqual([
        expect.stringMatching(
          /^Plan step 1 \("llena el correo con ana@example.test"\) may contain/,
        ),
      ]);
      expect(result.expectations).toEqual([]);
    }, 30_000);
  });

  it('clicks the chosen one of several identical links and pins it in generated code', async () => {
    const page = join(dir, 'repeated.html');
    await writeFile(
      page,
      [1, 2, 3, 4]
        .map((n) => `<section><a href="#from-${n}">Cotiza tu envío</a></section>`)
        .join('') + '<div style="cursor:pointer"><h3>Envío express</h3><p>Llega mañana</p></div>',
    );
    fakeJev(
      [
        { action: 'click', target: 'el_3', input_key: 'none' },
        { action: 'click', target: 'el_5', input_key: 'none' },
      ],
      [{ step_0: 'click', step_1: 'click' }],
    );
    const output = join(dir, 'repeated.spec.ts');
    // Spanish step texts on purpose: prompt steps may be written in any language.
    const result = await runCordy(
      parseCliArgs([
        'clic en "Cotiza tu envío", clic en "Envío express"',
        '--start-url',
        pathToFileURL(page).href,
        '--expect',
        'url:#from-3',
        '--output',
        output,
      ]),
    );
    expect(result.actions.map((record) => [record.status, record.action])).toEqual([
      [
        'succeeded',
        expect.objectContaining({
          kind: 'click',
          locator: expect.objectContaining({ value: 'link:Cotiza tu envío', nth: 2 }),
        }),
      ],
      [
        'succeeded',
        expect.objectContaining({
          locator: expect.objectContaining({ strategy: 'getByText', value: 'Envío express' }),
        }),
      ],
    ]);
    expect(result.expectations[0]).toMatchObject({ status: 'passed' });
    expect(await readFile(output, 'utf8')).toContain(
      'page.getByRole("link", { name: "Cotiza tu envío" }).nth(2).click()',
    );
  }, 60_000);

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

describe('unsuccessful run reasons', () => {
  const step = { index: 1, kind: 'click' as const, workflowKind: 'click', anchor: 'free' as const };
  const click = {
    kind: 'click' as const,
    locator: { strategy: 'getByText' as const, value: 'Go', confidence: 1, evidenceId: 'o' },
    reason: 'r',
    highImpact: false,
  };
  it('names a failed action with the first line of its error', () => {
    expect(
      unsuccessfulRunReason(
        [{ ...step, text: 'clic en "Go"' }],
        [{ action: click, status: 'failed', error: 'locator.click: Timeout\nCall log: ...' }],
        [1],
        [],
        [],
      ),
    ).toBe('step 2 ("clic en "Go"") was failed: locator.click: Timeout');
  });
  it('falls back to the first error, then the first failed expectation', () => {
    expect(unsuccessfulRunReason([], [], [], ['Plan step 2 was not completed'], [])).toBe(
      'Plan step 2 was not completed',
    );
    expect(
      unsuccessfulRunReason([], [], [], [], [{ spec: 'text:Resumen', status: 'failed' }]),
    ).toBe('expectation text:Resumen failed');
    expect(unsuccessfulRunReason([], [], [], [], [{ spec: 'text:A', status: 'passed' }])).toBe(
      undefined,
    );
  });
});
