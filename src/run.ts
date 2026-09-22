import { chromium, type Browser, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import type { ParsedOptions } from './cli-options.js';
import { loadInputs, loadPrompt } from './inputs.js';
import { JevClient } from './jev.js';
import type { CordyConfig } from './config.js';
import { observePage } from './observe.js';
import type { ActionRecord, PlannedAction } from './domain.js';

function locatorFor(page: Page, locator: { strategy: string; value: string }) {
  if (locator.strategy === 'getByLabel') return page.getByLabel(locator.value);
  if (locator.strategy === 'getByPlaceholder') return page.getByPlaceholder(locator.value);
  if (locator.strategy === 'getByText') return page.getByText(locator.value);
  if (locator.strategy === 'testId') return page.getByTestId(locator.value);
  if (locator.strategy === 'getByRole') { const [role, ...name] = locator.value.split(':'); return page.getByRole(role as 'button' | 'textbox' | 'combobox', { name: name.join(':') }); }
  return page.locator(locator.value);
}

export function generateTypeScript(actions: ActionRecord[], startUrl?: string) {
  const lines = ['import { expect, test } from \'@playwright/test\';', '', "test('cordy automation', async ({ page }) => {", '  const inputs = process.env as Record<string, string>;'];
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
  lines.push('});', '', '// Inputs are intentionally external and must be provided by the generated consumer.');
  return lines.join('\n');
}
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
  const task = loadPrompt(options); const inputs = loadInputs(options); const startUrl = options.startUrl;
  if (!startUrl) throw new Error('define --start-url para abrir el navegador');
  const browser: Browser = await chromium.launch({ headless: !options.headed }); const page = await browser.newPage(); const actions: ActionRecord[] = [];
  try {
    await page.goto(startUrl); const jev = new JevClient({ apiKey: config ? process.env[config.jev.apiKeyEnv] : undefined, endpoint: config?.jev.endpoint, verbose: options.verbose });
    for (let step = 0; step < options.maxSteps; step += 1) {
      const recentActions = actions.slice(-5).map(record => ({ kind: record.action.kind, locator: 'locator' in record.action ? `${record.action.locator.strategy}:${record.action.locator.value}` : undefined, inputKey: 'inputKey' in record.action ? record.action.inputKey : undefined, status: record.status }));
      const state = await observePage(page, task, `obs_${step + 1}`, recentActions);
      const action = await jev.nextAction(state, inputs); const record = await execute(page, action, inputs, options.approve, options.dryRun); actions.push(record);
      if (options.verbose) console.error(JSON.stringify({ step: step + 1, action: record }, null, 2));
      if (record.status !== 'succeeded') break;
      const completedInputKeys = new Set(actions.filter(item => item.status === 'succeeded' && item.action.kind === 'fill').map(item => item.action.kind === 'fill' ? item.action.inputKey : undefined).filter((key): key is string => Boolean(key)));
      if (Object.keys(inputs).length > 0 && Object.keys(inputs).every(key => completedInputKeys.has(key))) break;
    }
    const result = { task, startUrl, headed: options.headed, dryRun: options.dryRun, actions };
    if (options.output) await writeFile(options.output, generateTypeScript(actions, startUrl), 'utf8');
    return result;
  } finally { await browser.close(); }
}
