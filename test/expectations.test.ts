import { describe, expect, it } from 'vitest';
import { inferExpectations } from '../src/expectations.js';

describe('prompt expectation inference', () => {
  it('extracts result text and button name from explicit Spanish wording', () => {
    const result = inferExpectations('al simular debe de presentar como resultado esperado una pantalla con los resumen del envio y un boton de guardar cotización');
    expect(result.visible).toEqual(['resumen del envio']);
    expect(result.buttons).toEqual(['guardar cotización']);
  });
  it('does not invent expectations without explicit result wording', () => {
    expect(inferExpectations('simula un credito llenando el formulario')).toEqual({ visible: [], buttons: [] });
  });
});
