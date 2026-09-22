import { chromium, type Browser, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import type { ParsedOptions } from './cli-options.js';
import { loadInputs, loadPrompt } from './inputs.js';
import { JevClient } from './jev.js';
import type { CordyConfig } from './config.js';
import { observePage } from './observe.js';
import type { ActionRecord, PlannedAction } from './domain.js';
import { inferExpectations } from './expectations.js';

function locatorFor(page: Page, locator: { strategy: string; value: string }) {
  if (locator.strategy === 'getByLabel') return page.getByLabel(locator.value);
  if (locator.strategy === 'getByPlaceholder') return page.getByPlaceholder(locator.value);
  if (locator.strategy === 'getByText') return page.getByText(locator.value);
  if (locator.strategy === 'testId') return page.getByTestId(locator.value);
  if (locator.strategy === 'getByRole') { const [role, ...name] = locator.value.split(':'); return page.getByRole(role as 'button' | 'textbox' | 'combobox', { name: name.join(':') }); }
  return page.locator(locator.value);
}

export function generateTypeScript(actions: ActionRecord[], startUrl?: string, outputKind: 'test' | 'automation' = 'test', expectVisible: string[] = [], expectButtons: string[] = [], expectUrl: string[] = []) {
  const lines = outputKind === 'test' ? ['import { expect, test } from \'@playwright/test\';', '', "test('cordy automation', async ({ page }) => {", '  const inputs = process.env as Record<string, string>;'] : ['import { chromium } from \'playwright\';', '', '(async () => {', '  const browser = await chromium.launch({ headless: false });', '  const page = await browser.newPage();'];
  if (startUrl) lines.push(`  await page.goto(${JSON.stringify(startUrl)});`);
  for (const record of actions.filter(item => item.status === 'succeeded')) {
    const action = record.action;
    if (action.kind === 'goto') lines.push(`  await page.goto(${JSON.stringify(action.url)});`);
    if (action.kind === 'fill') lines.push(`  await page.${locatorExpression(action.locator)}.fill(inputs.${action.inputKey});`);
    if (action.kind === 'select') lines.push(`  await page.${locatorExpression(action.locator)}.selectOption(inputs.${action.inputKey});`);
    if (action.kind === 'check') lines.push(`  await page.${locatorExpression(action.locator)}.setChecked(Boolean(inputs.${action.inputKey}));`);
    if (action.kind === 'click') lines.push(`  await page.${locatorExpression(action.locator)}.click();`);
    if (action.kind === 'wait') lines.push('  await page.waitForLoadState(\'domcontentloaded\');');
  }
  if (outputKind === 'test') { for (const text of expectVisible) lines.push(`  await expect(page.getByText(new RegExp(${JSON.stringify(text)}, 'i')).first()).toBeVisible();`); for (const button of expectButtons) lines.push(`  await expect(page.getByRole('button', { name: new RegExp(${JSON.stringify(button)}, 'i') })).toBeVisible();`); for (const url of expectUrl) lines.push(`  await expect(page).toHaveURL(${JSON.stringify(url)});`); lines.push('});', '', '// Inputs are intentionally external and must be provided by the generated consumer.'); }
  else { for (const text of expectVisible) lines.push(`  await page.getByText(${JSON.stringify(text)}).first().waitFor({ state: 'visible' });`); for (const button of expectButtons) lines.push(`  await page.getByRole('button', { name: new RegExp(${JSON.stringify(button)}, 'i') }).waitFor({ state: 'visible' });`); for (const url of expectUrl) lines.push(`  await page.waitForURL(${JSON.stringify(url)});`); lines.push('  await browser.close();', '})();'); }
  return lines.join('\n');
}
function escapeRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function locatorExpression(locator: { strategy: string; value: string }) { const value = JSON.stringify(locator.value); if (locator.strategy === 'getByLabel') return `getByLabel(${value})`; if (locator.strategy === 'getByPlaceholder') return `getByPlaceholder(${value})`; if (locator.strategy === 'getByText') return `getByText(${value})`; if (locator.strategy === 'testId') return `getByTestId(${value})`; if (locator.strategy === 'getByRole') { const [role, ...name] = locator.value.split(':'); return `getByRole(${JSON.stringify(role)}, { name: ${JSON.stringify(name.join(':'))} })`; } return `locator(${value})`; }

async function execute(page: Page, action: PlannedAction, inputs: Record<string, string>, approve: boolean, dryRun: boolean): Promise<ActionRecord> {
  if (action.kind === 'needs_review') return { action, status: 'blocked', error: action.reason };
  if (action.kind === 'click' && action.highImpact && !approve) return { action, status: 'blocked', error: 'requiere --approve' };
  if (dryRun) return { action, status: 'planned' };
  try {
    if (action.kind === 'wait') await page.waitForLoadState('domcontentloaded');
    else if (action.kind === 'fill') await locatorFor(page, action.locator).fill(inputs[action.inputKey] ?? (() => { throw new Error(`input faltante: ${action.inputKey}`); })());
    else if (action.kind === 'select') await locatorFor(page, action.locator).selectOption(inputs[action.inputKey]);
    else if (action.kind === 'check') await locatorFor(page, action.locator).setChecked(inputs[action.inputKey] === 'true');
    else if (action.kind === 'click') { const beforeUrl = page.url(); await locatorFor(page, action.locator).click(); await Promise.race([page.waitForURL(url => url.toString() !== beforeUrl, { timeout: 5_000 }), page.waitForTimeout(750)]).catch(() => undefined); await page.waitForTimeout(3_000); }
    return { action, status: 'succeeded' };
  } catch (error) { return { action, status: 'failed', error: error instanceof Error ? error.message : 'error desconocido' }; }
}

export async function runCordy(options: ParsedOptions, config?: CordyConfig) {
  const task = loadPrompt(options); const inputs = loadInputs(options); const startUrl = options.startUrl; const inferred = inferExpectations(task); const expectVisible = [...options.expectVisible, ...inferred.visible]; const expectButtons = [...options.expectButtons, ...inferred.buttons];
  if (!startUrl) throw new Error('define --start-url para abrir el navegador');
  const browser: Browser = await chromium.launch({ headless: !options.headed }); const page = await browser.newPage(); const actions: ActionRecord[] = [];
  try {
    await page.goto(startUrl); const jev = new JevClient({ apiKey: config ? process.env[config.jev.apiKeyEnv] : undefined, endpoint: config?.jev.endpoint, verbose: options.verbose });
    for (let step = 0; step < options.maxSteps; step += 1) {
      const recentActions = actions.slice(-5).map(record => ({ kind: record.action.kind, locator: 'locator' in record.action ? `${record.action.locator.strategy}:${record.action.locator.value}` : undefined, inputKey: 'inputKey' in record.action ? record.action.inputKey : undefined, status: record.status }));
      const state = await observePage(page, task, `obs_${step + 1}`, recentActions);
      const action = await jev.nextAction(state, inputs); const record = await execute(page, action, inputs, true, options.dryRun); actions.push(record);
      if (options.verbose) console.error(JSON.stringify({ step: step + 1, action: record }, null, 2));
      if (record.status !== 'succeeded') break;
      if (record.action.kind === 'click' && record.action.highImpact) break;
    }
    const expectations = options.dryRun ? [...expectVisible.map(text => ({ kind: 'visible', expected: text, status: 'planned' as const })), ...expectButtons.map(button => ({ kind: 'button', expected: button, status: 'planned' as const })), ...options.expectUrl.map(url => ({ kind: 'url', expected: url, status: 'planned' as const }))] : [
      ...await Promise.all(expectVisible.map(async text => ({ kind: 'visible' as const, expected: text, status: await page.getByText(new RegExp(escapeRegex(text), 'i')).first().isVisible().catch(() => false) ? 'passed' as const : 'failed' as const }))),
      ...await Promise.all(expectButtons.map(async button => ({ kind: 'button' as const, expected: button, status: await page.getByRole('button', { name: new RegExp(button, 'i') }).first().isVisible().catch(() => false) ? 'passed' as const : 'failed' as const }))),
      ...options.expectUrl.map(url => ({ kind: 'url' as const, expected: url, status: page.url() === url ? 'passed' as const : 'failed' as const })),
    ];
    const result = { task, startUrl, headed: options.headed, dryRun: options.dryRun, actions, expectations };
    if (options.output) await writeFile(options.output, generateTypeScript(actions, startUrl, options.outputKind, expectVisible, expectButtons, options.expectUrl), 'utf8');
    return result;
  } finally { await browser.close(); }
}
