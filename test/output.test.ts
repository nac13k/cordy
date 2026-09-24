import { describe, expect, it } from 'vitest';
import type { ActionRecord } from '../src/domain.js';
import { collectExpectations, parseExpectation } from '../src/expectation-spec.js';
import { generateManagedBlock, generateTypeScript } from '../src/run.js';

const specs = (...items: string[]) => items.map((item) => parseExpectation(item, ['amount']));

describe('generated Playwright output', () => {
  it('includes visible text and URL assertions for test output', () => {
    const source = generateTypeScript(
      [],
      'https://example.test',
      'test',
      collectExpectations({
        expect: [],
        expectVisible: ['Resumen del envío'],
        expectButtons: ['Guardar cotización'],
        expectUrl: ['https://example.test/result'],
      }),
    );
    expect(source).toContain('resolveInputRecord');
    expect(source).toContain('toBeVisible()');
    expect(source).toContain(
      String.raw`toHaveURL(new RegExp("^https:\\/\\/example\\.test\\/result$", ""))`,
    );
    expect(source).toContain('Resumen del envío');
  });
  it('omits the expect import for automation output without expectations', () => {
    const source = generateTypeScript([], 'https://example.test', 'automation');
    expect(source).not.toContain('@playwright/test');
  });
  it('asserts expectations with expect in automation output', () => {
    const source = generateTypeScript(
      [],
      'https://example.test',
      'automation',
      specs('button:Guardar cotización'),
    );
    expect(source).toContain("import { expect } from '@playwright/test';");
    expect(source).toContain(
      `  await expect(page.getByRole('button', { name: new RegExp("Guardar cotización", "i") }).filter({ visible: true }).first()).toBeVisible();`,
    );
    expect(source.indexOf('toBeVisible')).toBeLessThan(source.indexOf('browser.close'));
  });
});

describe('generated assertions per kind', () => {
  const body = (...items: string[]) =>
    generateManagedBlock('k', [], undefined, specs(...items))
      .split('\n')
      .filter((line) => line.includes('expect('));
  it.each([
    [
      'text:Total (MXN)',
      `  await expect(page.getByText(new RegExp("Total \\\\(MXN\\\\)", "i")).filter({ visible: true }).first()).toBeVisible();`,
    ],
    [
      'not-text:/error/i',
      `  await expect(page.getByText(new RegExp("error", "i")).filter({ visible: true })).toHaveCount(0);`,
    ],
    [
      'button-enabled:Send',
      `  await expect(page.getByRole('button', { name: new RegExp("Send", "i") }).first()).toBeEnabled();`,
    ],
    [
      'not-button-disabled:Send',
      `  await expect(page.getByRole('button', { name: new RegExp("Send", "i") }).first()).toBeEnabled();`,
    ],
    ['url:/\\/result$/', `  await expect(page).toHaveURL(new RegExp("\\\\/result$", ""));`],
    ['not-title:Error', `  await expect(page).not.toHaveTitle(new RegExp("Error", "i"));`],
    [
      'value:Monthly payment=1,250',
      `  await expect(page.getByLabel("Monthly payment").first()).toHaveValue(new RegExp("1,250", "i"));`,
    ],
    ['checked:Accept', `  await expect(page.getByLabel("Accept").first()).toBeChecked();`],
    ['unchecked:Accept', `  await expect(page.getByLabel("Accept").first()).not.toBeChecked();`],
    ['count:Row=3', `  await expect(page.getByText(new RegExp("Row", "i"))).toHaveCount(3);`],
  ])('renders %s', (spec, line) => {
    expect(body(spec)).toEqual([line]);
  });
  it('renders input references against the generated input record', () => {
    expect(body('text:Total ${input.amount} MXN')).toEqual([
      `  await expect(page.getByText(new RegExp("Total " + escapeRegex(input["amount"]) + " MXN", "i")).filter({ visible: true }).first()).toBeVisible();`,
    ]);
  });
  it('imports escapeRegex only when an expectation references an input', () => {
    const withRef = generateTypeScript([], undefined, 'test', specs('text:${input.amount}'));
    expect(withRef).toContain("import { resolveInputRecord, escapeRegex } from '@nac13k/cordy';");
    const withoutRef = generateTypeScript([], undefined, 'test', specs('text:Summary'));
    expect(withoutRef).toContain("import { resolveInputRecord } from '@nac13k/cordy';");
    expect(
      generateTypeScript([], undefined, 'automation', specs('text:${input.amount}')),
    ).toContain('escapeRegex } from');
  });
  it('renders negated expectations after positive ones', () => {
    expect(
      body('not-text:Error', 'text:Summary').map((line) => line.includes('toHaveCount(0)')),
    ).toEqual([false, true]);
  });
});

describe('managed test blocks', () => {
  it('wraps the test in cordy markers titled with the slug', () => {
    const source = generateManagedBlock('login', [], 'https://example.test', specs('text:Hola'));
    expect(source.split('\n')).toEqual([
      '// cordy:begin login',
      "test('login', async ({ page }) => {",
      '  const input = resolveInputRecord({}) as Record<string, string>;',
      '  await page.goto("https://example.test");',
      `  await expect(page.getByText(new RegExp("Hola", "i")).filter({ visible: true }).first()).toBeVisible();`,
      '});',
      '// cordy:end login',
    ]);
  });
});

describe('generated uploads', () => {
  const upload: ActionRecord = {
    action: {
      kind: 'upload',
      locator: { strategy: 'locator', value: '#doc', confidence: 1, evidenceId: 'o' },
      inputKey: 'id_document',
      reason: 'r',
    },
    status: 'succeeded',
  };
  const files = { id_document: ['./fixtures/id.pdf'] };
  it('declares inline file paths and uploads them in test output', () => {
    const source = generateManagedBlock('upload', [upload], undefined, [], {
      kind: 'inline',
      values: { name: 'Ana' },
      files,
    });
    expect(source.split('\n')).toEqual([
      '// cordy:begin upload',
      "test('upload', async ({ page }) => {",
      '  const input = resolveInputRecord({"name":"Ana"}) as Record<string, string>;',
      '  const files: Record<string, string[]> = {"id_document":["./fixtures/id.pdf"]};',
      '  await page.locator("#doc").setInputFiles(files["id_document"]);',
      '});',
      '// cordy:end upload',
    ]);
  });
  it('keeps reading value inputs from the inputs file in automation output', () => {
    const source = generateTypeScript([upload], undefined, 'automation', [], {
      kind: 'file',
      path: './inputs.json',
      files,
    });
    expect(source).toContain(
      `const input = resolveInputRecord(JSON.parse(readFileSync("./inputs.json", 'utf8'))`,
    );
    expect(source).toContain('const files: Record<string, string[]> = {"id_document"');
    expect(source).toContain('.setInputFiles(files["id_document"]);');
  });
  it('omits the files declaration when there are no file inputs', () => {
    expect(generateTypeScript([], undefined, 'test')).not.toContain('const files');
  });

  it('waits for the load state recorded by a plan wait step', () => {
    const source = generateTypeScript(
      [{ action: { kind: 'wait', state: 'load', reason: 'r' }, status: 'succeeded' }],
      undefined,
      'test',
    );
    expect(source).toContain("  await page.waitForLoadState('load');");
    expect(source).not.toContain('waitForTimeout');
  });
});
