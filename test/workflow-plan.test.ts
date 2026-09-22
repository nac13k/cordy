import { describe, expect, it } from 'vitest';
import { createWorkflowPlan } from '../src/workflow-plan.js';

describe('workflow plan', () => {
  it('creates ordered navigation, fill, final click and result assertions', () => {
    const plan = createWorkflowPlan(
      'entra a la seccion cotizador de envios y simula un credito llenando el formulario y al simular debe de presentar como resultado esperado una pantalla con los resumen del envio y un boton de guardar cotización',
      { peso: '3500000', monto: '2500000' },
    );
    expect(plan.steps.map(step => step.kind)).toEqual(['navigate_section', 'click', 'fill_inputs', 'click', 'assert']);
    expect(plan.steps[0]).toMatchObject({ kind: 'navigate_section', target: 'cotizador de envios' });
    expect(plan.steps[1]).toMatchObject({ kind: 'click', target: 'cotiza tu envio', finalImpact: false });
    expect(plan.steps[2]).toMatchObject({ kind: 'fill_inputs', inputKeys: ['peso', 'monto'] });
    expect(plan.steps[3]).toMatchObject({ kind: 'click', target: 'simular', finalImpact: true });
    expect(plan.steps[4]).toMatchObject({ kind: 'assert' });
    if (plan.steps[4].kind === 'assert') {
      expect(plan.steps[4].expectations).toContainEqual({ kind: 'button', name: 'guardar cotización' });
    }
  });

  it('keeps the explicitly provided inputs for a section flow', () => {
    const plan = createWorkflowPlan('entra a la seccion cotizador de envios y llena el formulario', { monto: '1' });
    expect(plan.steps[0]).toMatchObject({ kind: 'navigate_section', target: 'cotizador de envios' });
    expect(plan.steps[1]).toMatchObject({ kind: 'fill_inputs', inputKeys: ['monto'] });
  });

  it('does not invent navigation for a prompt without a section', () => {
    const plan = createWorkflowPlan('llena el formulario y simula el credito', { monto: '1' });
    expect(plan.steps[0].kind).toBe('fill_inputs');
  });
});
