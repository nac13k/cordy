import { describe, expect, it } from 'vitest';
import { generateTypeScript } from '../src/run.js';

describe('generated Playwright output', () => {
  it('includes visible text and URL assertions for test output', () => {
    const source = generateTypeScript(
      [],
      'https://example.test',
      'test',
      ['Resumen del envío'],
      ['Guardar cotización'],
      ['https://example.test/result'],
    );
    expect(source).toContain('resolveInputRecord');
    expect(source).toContain('toBeVisible()');
    expect(source).toContain('toHaveURL');
    expect(source).toContain('Resumen del envío');
  });
  it('omits expect import for automation output', () => {
    const source = generateTypeScript(
      [],
      'https://example.test',
      'automation',
      [],
      ['Guardar cotización'],
    );
    expect(source).not.toContain('@playwright/test');
    expect(source).toContain("waitFor({ state: 'visible' })");
  });
});
