import { describe, expect, it } from 'vitest';
import { planFromPrompt, splitPromptSteps } from '../src/prompt-steps.js';

describe('prompt splitting', () => {
  it('splits lines and removes dash markers', () => {
    expect(
      splitPromptSteps('- clic en "Registro"\n- llena el formulario\n- envía con "Crear cuenta"'),
    ).toEqual(['clic en "Registro"', 'llena el formulario', 'envía con "Crear cuenta"']);
  });
  it('removes numbered and bullet markers and blank lines', () => {
    expect(splitPromptSteps('1. Open "Pricing"\r\n\n2) Fill in the form\n* Wait\n• Send')).toEqual([
      'Open "Pricing"',
      'Fill in the form',
      'Wait',
      'Send',
    ]);
  });
  it('splits inline sequential numbering', () => {
    expect(splitPromptSteps('1. clic en "Registro" 2. llena el formulario 3. envía')).toEqual([
      'clic en "Registro"',
      'llena el formulario',
      'envía',
    ]);
    expect(splitPromptSteps('1) a 2) b')).toEqual(['a', 'b']);
  });
  it('does not split a number outside the sequence', () => {
    expect(splitPromptSteps('1. espera 3. llena el formulario')).toEqual([
      'espera 3. llena el formulario',
    ]);
  });
  it('splits on commas and semicolons outside quotes', () => {
    expect(splitPromptSteps('clic en "Sí, continuar", llena el formulario; envía.')).toEqual([
      'clic en "Sí, continuar"',
      'llena el formulario',
      'envía',
    ]);
    expect(splitPromptSteps('clic en “Sí, continuar”, envía')).toEqual([
      'clic en “Sí, continuar”',
      'envía',
    ]);
  });
  it('splits commas inside a numbered line', () => {
    expect(splitPromptSteps('1. clic en "A", espera\n2. envía')).toEqual([
      'clic en "A"',
      'espera',
      'envía',
    ]);
  });
  it('keeps decimal commas, inline dashes, and conjunctions', () => {
    expect(splitPromptSteps('espera 1,5 segundos')).toEqual(['espera 1,5 segundos']);
    expect(splitPromptSteps('clic en Sign-up - Free')).toEqual(['clic en Sign-up - Free']);
    expect(splitPromptSteps('Go to the "Pricing" section and click "Buy"')).toEqual([
      'Go to the "Pricing" section and click "Buy"',
    ]);
  });
  it('does not treat apostrophes as quotes', () => {
    expect(splitPromptSteps("don't wait, send")).toEqual(["don't wait", 'send']);
  });
});

describe('plan from prompt', () => {
  it('builds natural-language steps without a description', () => {
    expect(planFromPrompt('clic en "Registro", llena el formulario')).toEqual({
      steps: [
        { index: 0, kind: 'natural', text: 'clic en "Registro"' },
        { index: 1, kind: 'natural', text: 'llena el formulario' },
      ],
    });
  });
  it('rejects more than 50 steps', () => {
    expect(() => planFromPrompt(Array.from({ length: 51 }, () => 'a').join(', '))).toThrow(
      'at most 50 steps are allowed (got 51)',
    );
  });
  it('rejects a step longer than 300 characters', () => {
    expect(() => planFromPrompt(`ok, ${'a'.repeat(301)}`)).toThrow(
      'prompt step 2 must be at most 300 characters',
    );
  });
  it('rejects a prompt with no steps', () => {
    expect(() => planFromPrompt(', ;')).toThrow('the prompt has no steps');
  });
});
