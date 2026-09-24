import { describe, expect, it } from 'vitest';
import { generateManagedBlock, generateTypeScript } from '../src/run.js';

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

describe('managed test blocks', () => {
  it('wraps the test in cordy markers titled with the slug', () => {
    const source = generateManagedBlock('login', [], 'https://example.test', ['Hola']);
    expect(source.split('\n')).toEqual([
      '// cordy:begin login',
      "test('login', async ({ page }) => {",
      '  const input = resolveInputRecord({}) as Record<string, string>;',
      '  await page.goto("https://example.test");',
      `  await expect(page.getByText(new RegExp("Hola", 'i')).first()).toBeVisible();`,
      '});',
      '// cordy:end login',
    ]);
  });
});
