import { describe, expect, it } from 'vitest';
import { collectExpectations } from '../src/expectation-spec.js';
import { createWorkflowPlan } from '../src/workflow-plan.js';

describe('workflow plan', () => {
  // Spanish prompts on purpose: they exercise the planner's Spanish regexes.
  it('derives navigation, fill, the final click, and assertions without extra clicks', () => {
    const plan = createWorkflowPlan(
      'entra a la sección cotizador de envíos y simula un envío llenando el formulario y al simular debe de presentar como resultado esperado el resumen del envío y un botón de guardar cotización',
      { peso: '2', codigo_postal: '44100' },
    );
    expect(plan.steps.map((step) => step.kind)).toEqual([
      'navigate_section',
      'fill_inputs',
      'click',
      'assert',
    ]);
    expect(plan.steps[0]).toMatchObject({
      kind: 'navigate_section',
      target: 'cotizador de envíos',
    });
    expect(plan.steps[1]).toMatchObject({
      kind: 'fill_inputs',
      inputKeys: ['peso', 'codigo_postal'],
    });
    expect(plan.steps[2]).toMatchObject({ kind: 'click', target: 'simular', finalImpact: true });
    if (plan.steps[3].kind === 'assert') {
      expect(plan.steps[3].expectations).toEqual([
        expect.objectContaining({
          kind: 'button',
          negated: false,
          spec: 'button:guardar cotización',
        }),
      ]);
    }
  });

  it('adds no step for credit wording', () => {
    const plan = createWorkflowPlan('simula un crédito llenando el formulario', { monto: '1' });
    expect(plan.steps).toEqual([
      expect.objectContaining({ kind: 'fill_inputs', inputKeys: ['monto'] }),
      expect.objectContaining({ kind: 'click', target: 'simular', finalImpact: true }),
    ]);
  });

  it('keeps the explicitly provided inputs for a section flow', () => {
    const plan = createWorkflowPlan(
      'entra a la sección cotizador de envíos y llena el formulario',
      { peso: '1' },
    );
    expect(plan.steps[0]).toMatchObject({
      kind: 'navigate_section',
      target: 'cotizador de envíos',
    });
    expect(plan.steps[1]).toMatchObject({ kind: 'fill_inputs', inputKeys: ['peso'] });
  });

  it('does not invent navigation for a prompt without a section', () => {
    const plan = createWorkflowPlan('llena el formulario y simula el credito', { monto: '1' });
    expect(plan.steps[0].kind).toBe('fill_inputs');
  });

  it('carries CLI, alias, and inferred expectations in the assert step', () => {
    // Spanish prompt on purpose: the planner infers the "boton ..." expectation from it.
    const task = 'llena el formulario y simula el envío con un botón de guardar cotización';
    const expectations = collectExpectations(
      {
        expect: ['not-text:/error/i', 'value:Monto=${input.monto}'],
        expectVisible: ['Resumen'],
        expectButtons: [],
        expectUrl: ['https://example.test/result'],
        inferred: { visible: [], buttons: ['guardar cotización'] },
      },
      ['monto'],
    );
    const plan = createWorkflowPlan(task, { monto: '1' }, expectations);
    const assert = plan.steps.at(-1);
    expect(assert?.kind).toBe('assert');
    if (assert?.kind === 'assert')
      expect(assert.expectations.map((item) => item.spec)).toEqual([
        'not-text:/error/i',
        'value:Monto=${input.monto}',
        'text:Resumen',
        '--expect-url https://example.test/result',
        'button:guardar cotización',
      ]);
  });

  it('explains how to continue when no step can be derived from the prompt', () => {
    expect(() => createWorkflowPlan('Go to the Loans section and click Simulate', {})).toThrow(
      /no plan could be derived from the prompt.*--plan/,
    );
  });
});
