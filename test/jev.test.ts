import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { anchoredIn, HIGH_IMPACT_WORDS, isHighImpactName, JevClient } from '../src/jev.js';

// Recorded Jev response for a classification request (answers only, no credentials).
const classification = JSON.parse(
  readFileSync(new URL('./fixtures/jev-classification.json', import.meta.url), 'utf8'),
) as { request: { steps: string[] }; response: { answers: Record<string, { choice: string }> } };

describe('Jev planner', () => {
  const state = {
    task: 'fill',
    page: {
      url: 'https://example.test/form?token=secret',
      title: 'Test',
      origin: 'https://example.test',
    },
    interactiveElements: [
      {
        id: 'el_1',
        role: 'textbox',
        name: 'Email',
        valueState: 'empty' as const,
        visible: true,
        enabled: true,
        locatorCandidates: [{ strategy: 'getByLabel' as const, value: 'Email' }],
      },
    ],
    visibleText: 'Email',
    observationId: 'obs_1',
    observedAt: new Date().toISOString(),
  };
  it('sends redacted inputs and returns only an allowed action', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      expect(payload.state.inputs.email).toEqual({ available: true, type: 'provided_input' });
      expect(payload.state.inputs.password).toEqual({ available: true, type: 'provided_input' });
      return new Response(
        JSON.stringify({
          answers: {
            action: { type: 'choice', choice: 'fill' },
            target: { type: 'choice', choice: 'el_1' },
            input_key: { type: 'choice', choice: 'email' },
          },
        }),
        { status: 200 },
      );
    });
    const client = new JevClient({ apiKey: 'test-secret', fetcher });
    const action = await client.nextAction(state, {
      email: 'ana@example.com',
      password: 'do-not-send',
    });
    expect(action.kind).toBe('fill');
    if (action.kind === 'fill') expect(action.inputKey).toBe('email');
  });
  describe('clickable elements', () => {
    const card = {
      ...state.interactiveElements[0],
      id: 'el_2',
      role: 'clickable',
      name: 'Envío express',
      locatorCandidates: [{ strategy: 'getByText' as const, value: 'Envío express', nth: 1 }],
    };
    const answer = (action: string, inputKey: string) =>
      new JevClient({
        apiKey: 'test-only',
        fetcher: vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                answers: {
                  action: { choice: action },
                  target: { choice: 'el_2' },
                  input_key: { choice: inputKey },
                },
              }),
            ),
        ),
      }).nextAction({ ...state, interactiveElements: [card] }, { note: 'x' });
    it('allows a click and keeps the pinned position', async () => {
      expect(await answer('click', 'none')).toMatchObject({
        kind: 'click',
        locator: { strategy: 'getByText', value: 'Envío express', nth: 1 },
      });
    });
    it.each(['fill', 'select', 'check'])('rejects %s on a clickable element', async (action) => {
      expect(await answer(action, 'note')).toMatchObject({
        kind: 'needs_review',
        reason: `Jev proposed ${action} on an element with role=clickable`,
      });
    });
  });
  it('emits safe verbose traces without the credential, input values, or query string', async () => {
    const logs: string[] = [];
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            model: 'jev-1.13.0',
            usage: { input_tokens: 10, output_tokens: 2 },
            answers: { action: { choice: 'needs_review' }, target: { choice: 'needs_review' } },
          }),
          { status: 200 },
        ),
    );
    const client = new JevClient({
      apiKey: 'test-secret',
      fetcher,
      verbose: true,
      logger: (event) => logs.push(JSON.stringify(event)),
    });
    await client.nextAction(state, { email: 'secret-email', password: 'secret-password' });
    const output = logs.join('\n');
    expect(output).toContain('request');
    expect(output).toContain('response');
    expect(output).toContain('httpStatus');
    expect(output).not.toContain('test-secret');
    expect(output).not.toContain('secret-email');
    expect(output).not.toContain('secret-password');
    expect(output).not.toContain('token=secret');
  });
  it('blocks a navigation click whose accessible name does not match the current section', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            answers: {
              action: { choice: 'click' },
              target: { choice: 'el_1' },
              input_key: { choice: 'none' },
            },
          }),
          { status: 200 },
        ),
    );
    const client = new JevClient({ apiKey: 'test-only', fetcher });
    const action = await client.nextAction(
      {
        ...state,
        workflow: {
          kind: 'click',
          target: 'cotizador de envíos',
          allowedActions: ['click'],
        },
        interactiveElements: [
          {
            ...state.interactiveElements[0],
            id: 'el_1',
            role: 'button',
            name: 'Iniciar sesión',
            locatorCandidates: [{ strategy: 'getByRole' as const, value: 'button:Iniciar sesión' }],
          },
        ],
      },
      {},
    );
    expect(action).toMatchObject({ kind: 'needs_review' });
  });
  it('blocks an unknown or ambiguous action', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            answers: { action: { choice: 'needs_review' }, target: { choice: 'needs_review' } },
          }),
          { status: 200 },
        ),
    );
    const client = new JevClient({ apiKey: 'test-only', fetcher });
    const action = await client.nextAction(
      { ...state, interactiveElements: [], visibleText: '', observationId: 'obs' },
      {},
    );
    expect(action.kind).toBe('needs_review');
  });
  it('never invites an unconstrained click once all inputs are filled', async () => {
    const bodies: string[] = [];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(String(init?.body));
      return new Response(
        JSON.stringify({ answers: { action: { choice: 'wait' }, target: { choice: 'el_1' } } }),
      );
    });
    await new JevClient({ apiKey: 'test-only', fetcher }).nextAction(
      state,
      { email: 'x' },
      { consumedInputKeys: ['email'] },
    );
    const payload = JSON.parse(bodies[0]);
    expect(payload.questions.action.instructions).not.toMatch(/next safe click/i);
    expect(payload.state.workflow.allInputsFilled).toBe(true);
  });
  it('reports all inputs filled from the full consumption history', async () => {
    const payloads: Array<{ state: { workflow: { allInputsFilled: boolean } } }> = [];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      payloads.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({ answers: { action: { choice: 'wait' }, target: { choice: 'el_1' } } }),
        { status: 200 },
      );
    });
    const client = new JevClient({ apiKey: 'test-only', fetcher });
    const keys = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const inputs = Object.fromEntries(keys.map((key) => [key, 'value']));
    const recentActions = keys
      .slice(-5)
      .map((inputKey) => ({ kind: 'select', inputKey, status: 'succeeded' }));
    await client.nextAction({ ...state, recentActions }, inputs, { consumedInputKeys: keys });
    expect(payloads[0].state.workflow.allInputsFilled).toBe(true);
    await client.nextAction({ ...state, recentActions }, inputs);
    expect(payloads[1].state.workflow.allInputsFilled).toBe(false);
  });

  describe('file inputs', () => {
    const fileState = {
      ...state,
      interactiveElements: [
        ...state.interactiveElements,
        {
          id: 'el_2',
          role: 'file',
          name: 'Upload document',
          accept: '.pdf,image/*',
          multiple: false,
          valueState: 'empty' as const,
          visible: false,
          enabled: true,
          locatorCandidates: [{ strategy: 'locator' as const, value: '#doc' }],
        },
        {
          id: 'el_3',
          role: 'button',
          name: 'Simular',
          valueState: 'empty' as const,
          visible: true,
          enabled: true,
          locatorCandidates: [{ strategy: 'getByRole' as const, value: 'button:Simular' }],
        },
      ],
    };
    const propose = async (
      target: string,
      inputKey: string,
      files: Record<string, string[]>,
      action = 'fill',
    ) => {
      const bodies: string[] = [];
      const logs: string[] = [];
      const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(String(init?.body));
        return new Response(
          JSON.stringify({
            answers: {
              action: { choice: action },
              target: { choice: target },
              input_key: { choice: inputKey },
            },
          }),
          { status: 200 },
        );
      });
      const client = new JevClient({
        apiKey: 'test-only',
        fetcher,
        logger: (event) => logs.push(JSON.stringify(event)),
      });
      const result = await client.nextAction(fileState, { email: 'ana@example.com' }, { files });
      return { result, bodies, logs };
    };
    const idFile = { id_document: ['./fixtures/Ana_Lopez_ID.pdf'] };

    it('describes file keys as files without paths or names', async () => {
      const { bodies, logs } = await propose('el_2', 'id_document', idFile);
      const payload = JSON.parse(bodies[0]);
      expect(payload.state.inputs.id_document).toEqual({ available: true, type: 'file' });
      expect(payload.state.inputs.email).toEqual({ available: true, type: 'provided_input' });
      for (const text of [...bodies, ...logs]) {
        expect(text).not.toContain('Ana_Lopez_ID');
        expect(text).not.toContain('fixtures');
      }
      expect(logs.join('')).toContain('id_document (file)');
    });
    it('turns a fill of a file key on a file control into an upload', async () => {
      const { result } = await propose('el_2', 'id_document', idFile);
      expect(result).toMatchObject({
        kind: 'upload',
        inputKey: 'id_document',
        locator: { strategy: 'locator', value: '#doc' },
      });
    });
    it('rejects a file key on a textbox', async () => {
      expect((await propose('el_1', 'id_document', idFile)).result.kind).toBe('needs_review');
    });
    it('rejects a file key on a button instead of correcting it into a click', async () => {
      expect((await propose('el_3', 'id_document', idFile)).result.kind).toBe('needs_review');
    });
    it('rejects a value key on a file control', async () => {
      expect((await propose('el_2', 'email', idFile)).result.kind).toBe('needs_review');
    });
    it('rejects a file type outside the accept list', async () => {
      const { result } = await propose('el_2', 'id_document', { id_document: ['./a.docx'] });
      expect(result).toMatchObject({
        kind: 'needs_review',
        reason: expect.stringMatching(/does not accept/),
      });
    });
    it('rejects several files on a single-file control', async () => {
      const { result } = await propose('el_2', 'id_document', {
        id_document: ['./a.pdf', './b.pdf'],
      });
      expect(result).toMatchObject({
        kind: 'needs_review',
        reason: expect.stringMatching(/single file/),
      });
    });
  });

  describe('plan step classification', () => {
    const steps = classification.request.steps.map((text, index) => ({ index, text }));
    const classify = async (
      answers: Record<string, { choice: string }>,
      subset = steps,
    ): Promise<{ result: Promise<Map<number, string>>; bodies: string[] }> => {
      const bodies: string[] = [];
      const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(String(init?.body));
        return new Response(JSON.stringify({ answers }), { status: 200 });
      });
      const client = new JevClient({ apiKey: 'test-only', fetcher });
      return { result: client.classifySteps('Register a new account', subset), bodies };
    };
    it('sends one choice question per step and nothing but the task and step texts', async () => {
      const valid = steps.filter((step) => step.index !== 4);
      const { result, bodies } = await classify(classification.response.answers, valid);
      expect([...(await result).entries()]).toEqual([
        [0, 'click'],
        [1, 'wait'],
        [2, 'fill'],
        [3, 'submit'],
        [5, 'click'],
      ]);
      const payload = JSON.parse(bodies[0]);
      expect(Object.keys(payload.state)).toEqual(['task', 'plan']);
      expect(Object.keys(payload.questions)).toEqual([
        'step_0',
        'step_1',
        'step_2',
        'step_3',
        'step_5',
      ]);
      expect(payload.questions.step_0).toMatchObject({
        type: 'choice',
        criteria: { click: expect.any(String), compound: expect.any(String) },
      });
    });
    it('rejects a compound step naming it', async () => {
      const { result } = await classify(classification.response.answers);
      await expect(result).rejects.toThrow(
        'Plan step 5 ("llena el formulario y da clic en enviar") describes more than one action; split it into separate steps (in a prompt, separate them with commas or line breaks)',
      );
    });
    it('rejects missing and invalid answers naming the step', async () => {
      const { result } = await classify({ step_0: { choice: 'click' } }, steps.slice(0, 2));
      await expect(result).rejects.toThrow(
        /Plan step 2 \("espera a que cargue"\) could not be classified/,
      );
      const invalid = await classify({ step_0: { choice: 'dance' } }, steps.slice(0, 1));
      await expect(invalid.result).rejects.toThrow(/answer: dance/);
    });
  });

  describe('natural-language steps', () => {
    const button = (id: string, name: string) => ({
      id,
      role: 'button',
      name,
      valueState: 'empty' as const,
      visible: true,
      enabled: true,
      locatorCandidates: [{ strategy: 'getByRole' as const, value: `button:${name}` }],
    });
    const stepState = {
      ...state,
      interactiveElements: [
        ...state.interactiveElements,
        button('el_2', 'Regístrate'),
        button('el_3', 'Iniciar sesión'),
        button('el_4', 'Enviar solicitud'),
        button('el_5', 'Регистрация'),
      ],
      workflow: { kind: 'click', allowedActions: ['click'] },
    };
    const answer = (answers: Record<string, string>) =>
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              answers: Object.fromEntries(
                Object.entries(answers).map(([key, choice]) => [key, { choice }]),
              ),
            }),
          ),
      );
    const propose = (
      target: string,
      text: string,
      anchor: 'quoted' | 'free',
      extra: Partial<typeof stepState> = {},
    ) =>
      new JevClient({
        apiKey: 'test-only',
        fetcher: answer({ action: 'click', target, input_key: 'none' }),
      }).nextAction({ ...stepState, ...extra }, {}, { step: { kind: 'click', anchor, text } });

    // Spanish and Russian step texts on purpose: anchoring must work in any language.
    it('accepts a control named in the step text', async () => {
      expect((await propose('el_2', 'da clic en seccion registrate', 'free')).kind).toBe('click');
    });
    it('rejects a control that is not named in the step', async () => {
      expect(await propose('el_3', 'da clic en seccion registrate', 'free')).toMatchObject({
        kind: 'needs_review',
        reason: expect.stringMatching(/"Iniciar sesión" is not named in the step/),
      });
    });
    it('requires an exact match for quoted text', async () => {
      expect((await propose('el_4', 'clic en "Enviar"', 'quoted')).kind).toBe('needs_review');
      expect((await propose('el_4', 'clic en “Enviar solicitud”', 'quoted')).kind).toBe('click');
    });
    it('anchors non-Latin names', async () => {
      expect((await propose('el_5', 'нажмите Регистрация', 'free')).kind).toBe('click');
      expect(anchoredIn('Si', 'si', 'free')).toBe(true);
      expect(anchoredIn('a', 'a b', 'free')).toBe(false);
      expect(anchoredIn('Sí', 'decir si al final', 'free')).toBe(true);
      expect(anchoredIn('Si', 'sistema', 'free')).toBe(false);
    });
    it('signals step completion when Jev picks no input in a natural fill step', async () => {
      const step = { kind: 'fill', anchor: 'free' as const, text: 'llena el formulario' };
      const cases: Array<Record<string, string>> = [
        { action: 'fill', target: 'el_1', input_key: 'none' },
        { action: 'wait', target: 'needs_review' },
      ];
      for (const answers of cases) {
        const client = new JevClient({ apiKey: 'test-only', fetcher: answer(answers) });
        expect((await client.nextAction(stepState, { email: 'x' }, { step })).kind).toBe(
          'step_complete',
        );
      }
      const explicit = new JevClient({
        apiKey: 'test-only',
        fetcher: answer({ action: 'fill', target: 'el_1', input_key: 'none' }),
      });
      expect(
        (
          await explicit.nextAction(
            stepState,
            { email: 'x' },
            {
              step: { kind: 'fill', anchor: 'explicit', keys: ['email'] },
            },
          )
        ).kind,
      ).toBe('needs_review');
    });
  });

  describe('incompatible proposals', () => {
    const button = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
      id,
      role: 'button',
      name,
      valueState: 'empty' as const,
      visible: true,
      enabled: true,
      locatorCandidates: [{ strategy: 'getByRole' as const, value: `button:${name}` }],
      ...extra,
    });
    const propose = (answers: Record<string, string>, elements: unknown[], task: string) =>
      new JevClient({
        apiKey: 'test-only',
        fetcher: vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                answers: Object.fromEntries(
                  Object.entries(answers).map(([key, choice]) => [key, { choice }]),
                ),
              }),
            ),
        ),
      }).nextAction(
        { ...state, task, interactiveElements: elements as typeof state.interactiveElements },
        { peso: '2' },
      );

    // Spanish prompts on purpose: removed rewrites used to key off Spanish prompt verbs.
    it('returns needs_review for a fill proposed on a button, without producing a click', async () => {
      const result = await propose(
        { action: 'fill', target: 'el_1', input_key: 'peso' },
        [button('el_1', 'Cotizar ahora')],
        'entra a la sección cotizador de envíos',
      );
      expect(result).toEqual({
        kind: 'needs_review',
        reason: 'Jev proposed fill on an element with role=button',
      });
    });
    it('gives selector-based entry buttons no special treatment', async () => {
      const result = await propose(
        { action: 'fill', target: 'el_1', input_key: 'peso' },
        [
          button('el_1', 'Empezar', {
            locatorCandidates: [{ strategy: 'locator' as const, value: '[data-event="entry"]' }],
          }),
        ],
        'entra a la sección cotizador de envíos y simula',
      );
      expect(result.kind).toBe('needs_review');
    });
    it('retargets a fill by input key name to the single matching text field', async () => {
      const client = new JevClient({
        apiKey: 'test-only',
        fetcher: vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                answers: {
                  action: { choice: 'fill' },
                  target: { choice: 'el_1' },
                  input_key: { choice: 'codigo_postal' },
                },
              }),
            ),
        ),
      });
      const result = await client.nextAction(
        {
          ...state,
          interactiveElements: [
            button('el_1', 'Cotizar ahora'),
            {
              ...state.interactiveElements[0],
              id: 'el_2',
              name: 'Código postal',
              locatorCandidates: [{ strategy: 'locator' as const, value: '#codigo_postal' }],
            },
          ],
        },
        { codigo_postal: '44100' },
      );
      expect(result).toMatchObject({
        kind: 'fill',
        inputKey: 'codigo_postal',
        locator: { value: '#codigo_postal' },
      });
    });
  });
});

describe('high-impact control names', () => {
  it.each(['Simulate', 'PLACE ORDER', 'Send request', 'Continuar', 'Pay now', 'Delete account'])(
    'treats %s as high impact',
    (name) => expect(isHighImpactName(name)).toBe(true),
  );
  it.each(['Cotizador de envíos', 'Next page', 'Help'])('treats %s as a safe control', (name) =>
    expect(isHighImpactName(name)).toBe(false),
  );
  it('keeps the Spanish verbs and submit in the list', () => {
    expect(HIGH_IMPACT_WORDS).toEqual(
      expect.arrayContaining(['submit', 'enviar', 'simular', 'confirmar', 'calcular']),
    );
  });
});
