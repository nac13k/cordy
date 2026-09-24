import { describe, expect, it } from 'vitest';
import { inferExpectations } from '../src/expectations.js';

// Spanish prompts on purpose: inference matches Spanish wording.
describe('prompt expectation inference', () => {
  it('infers the button name from explicit button wording', () => {
    expect(
      inferExpectations(
        'al simular debe mostrar el resumen del envío y un botón de guardar cotización',
      ),
    ).toEqual({ visible: [], buttons: ['guardar cotización'] });
  });
  it('infers no visible text from a result heading', () => {
    expect(
      inferExpectations('debe mostrar una pantalla con los datos del resultado solicitado'),
    ).toEqual({ visible: [], buttons: [] });
  });
  it('does not invent expectations without explicit result wording', () => {
    expect(inferExpectations('simula un envío llenando el formulario')).toEqual({
      visible: [],
      buttons: [],
    });
  });
});
