import { chromium, type Browser, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import type { ParsedOptions } from './cli-options.js';
import { loadInputs, loadPrompt } from './inputs.js';
import { JevClient } from './jev.js';
import type { CordyConfig } from './config.js';
import { observePage } from './observe.js';
import type { ActionRecord, PlannedAction } from './domain.js';
import { inferExpectations } from './expectations.js';
import { createWorkflowPlan, type WorkflowPlan, type WorkflowStep } from './workflow-plan.js';
import { resolveInputRecord } from './dynamic-inputs.js';
import {
  decideOutput,
  planManagedWrite,
  renderImports,
  type RequiredImport,
} from './managed-output.js';

export type GeneratedInputSource =
  { kind: 'inline'; values: Record<string, string> } | { kind: 'file'; path: string };

function isSensitiveInputKey(key: string) {
  return /password|passwd|secret|token|api[_-]?key|authorization|cookie/i.test(key);
}
function inlineInputSource(values: Record<string, string>) {
  return `resolveInputRecord({${Object.entries(values)
    .map(
      ([key, value]) =>
        `${JSON.stringify(key)}:${isSensitiveInputKey(key) ? `process.env[${JSON.stringify(key)}] ?? ''` : JSON.stringify(value)}`,
    )
    .join(',')}})`;
}
function locatorFor(page: Page, locator: { strategy: string; value: string }) {
  if (locator.strategy === 'getByLabel') return page.getByLabel(locator.value);
  if (locator.strategy === 'getByPlaceholder') return page.getByPlaceholder(locator.value);
  if (locator.strategy === 'getByText') return page.getByText(locator.value);
  if (locator.strategy === 'testId') return page.getByTestId(locator.value);
  if (locator.strategy === 'getByRole') {
    const [role, ...name] = locator.value.split(':');
    return page.getByRole(role as 'button' | 'textbox' | 'combobox', { name: name.join(':') });
  }
  return page.locator(locator.value);
}

export function requiredImports(inputSource: GeneratedInputSource): RequiredImport[] {
  return [
    { module: '@playwright/test', names: ['expect', 'test'] },
    ...(inputSource.kind === 'file' ? [{ module: 'node:fs', names: ['readFileSync'] }] : []),
    { module: 'cordy', names: ['resolveInputRecord'] },
  ];
}
function inputDeclaration(inputSource: GeneratedInputSource) {
  return inputSource.kind === 'inline'
    ? `  const input = ${inlineInputSource(inputSource.values)} as Record<string, string>;`
    : `  const input = resolveInputRecord(JSON.parse(readFileSync(${JSON.stringify(inputSource.path)}, 'utf8')) as Record<string, string>);`;
}
function actionLines(actions: ActionRecord[], startUrl?: string) {
  const lines: string[] = [];
  if (startUrl) lines.push(`  await page.goto(${JSON.stringify(startUrl)});`);
  for (const record of actions.filter((item) => item.status === 'succeeded')) {
    const action = record.action;
    if (action.kind === 'goto') lines.push(`  await page.goto(${JSON.stringify(action.url)});`);
    if (action.kind === 'fill')
      lines.push(
        `  await page.${locatorExpression(action.locator)}.fill(input.${action.inputKey});`,
      );
    if (action.kind === 'select')
      lines.push(
        `  await page.${locatorExpression(action.locator)}.selectOption(input.${action.inputKey});`,
      );
    if (action.kind === 'check')
      lines.push(
        `  await page.${locatorExpression(action.locator)}.setChecked(Boolean(input.${action.inputKey}));`,
      );
    if (action.kind === 'click')
      lines.push(`  await page.${locatorExpression(action.locator)}.click();`);
    if (action.kind === 'wait') lines.push("  await page.waitForLoadState('domcontentloaded');");
  }
  return lines;
}
function testBody(
  title: string,
  actions: ActionRecord[],
  startUrl: string | undefined,
  expectVisible: string[],
  expectButtons: string[],
  expectUrl: string[],
  inputSource: GeneratedInputSource,
) {
  const lines = [
    `test('${title.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}', async ({ page }) => {`,
    inputDeclaration(inputSource),
    ...actionLines(actions, startUrl),
  ];
  for (const text of expectVisible)
    lines.push(
      `  await expect(page.getByText(new RegExp(${JSON.stringify(text)}, 'i')).first()).toBeVisible();`,
    );
  for (const button of expectButtons)
    lines.push(
      `  await expect(page.getByRole('button', { name: new RegExp(${JSON.stringify(button)}, 'i') })).toBeVisible();`,
    );
  for (const url of expectUrl)
    lines.push(`  await expect(page).toHaveURL(${JSON.stringify(url)});`);
  lines.push('});');
  return lines;
}

export function generateManagedBlock(
  slug: string,
  actions: ActionRecord[],
  startUrl?: string,
  expectVisible: string[] = [],
  expectButtons: string[] = [],
  expectUrl: string[] = [],
  inputSource: GeneratedInputSource = { kind: 'inline', values: {} },
) {
  return [
    `// cordy:begin ${slug}`,
    ...testBody(slug, actions, startUrl, expectVisible, expectButtons, expectUrl, inputSource),
    `// cordy:end ${slug}`,
  ].join('\n');
}

export function generateTypeScript(
  actions: ActionRecord[],
  startUrl?: string,
  outputKind: 'test' | 'automation' = 'test',
  expectVisible: string[] = [],
  expectButtons: string[] = [],
  expectUrl: string[] = [],
  inputSource: GeneratedInputSource = { kind: 'inline', values: {} },
  testTitle = 'cordy automation',
) {
  if (outputKind === 'test')
    return [
      ...renderImports(requiredImports(inputSource)),
      '',
      ...testBody(
        testTitle,
        actions,
        startUrl,
        expectVisible,
        expectButtons,
        expectUrl,
        inputSource,
      ),
      '',
      '// Inputs are intentionally external and must be provided by the generated consumer.',
    ].join('\n');
  const lines = [
    "import { chromium } from 'playwright';",
    ...(inputSource.kind === 'file' ? ["import { readFileSync } from 'node:fs';"] : []),
    "import { resolveInputRecord } from 'cordy';",
    '',
    '(async () => {',
    inputDeclaration(inputSource),
    '  const browser = await chromium.launch({ headless: false });',
    '  const page = await browser.newPage();',
    ...actionLines(actions, startUrl),
  ];
  for (const text of expectVisible)
    lines.push(
      `  await page.getByText(${JSON.stringify(text)}).first().waitFor({ state: 'visible' });`,
    );
  for (const button of expectButtons)
    lines.push(
      `  await page.getByRole('button', { name: new RegExp(${JSON.stringify(button)}, 'i') }).waitFor({ state: 'visible' });`,
    );
  for (const url of expectUrl) lines.push(`  await page.waitForURL(${JSON.stringify(url)});`);
  lines.push('  await browser.close();', '})();');
  return lines.join('\n');
}
function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function currentWorkflowStep(
  plan: WorkflowPlan,
  actions: ActionRecord[],
): WorkflowStep | undefined {
  const successful = actions.filter((record) => record.status === 'succeeded');
  for (const step of plan.steps) {
    if (step.kind === 'navigate_section') {
      if (!successful.some((record) => record.action.kind === 'click')) return step;
      continue;
    }
    if (step.kind === 'fill_inputs') {
      const filled = new Set(
        successful
          .filter((record) => record.action.kind === 'fill')
          .map((record) => (record.action.kind === 'fill' ? record.action.inputKey : undefined)),
      );
      if (!step.inputKeys.every((key) => filled.has(key)))
        return { ...step, inputKeys: step.inputKeys.filter((key) => !filled.has(key)) };
      continue;
    }
    if (step.kind === 'click') {
      const clickStepsBefore = plan.steps
        .slice(0, plan.steps.indexOf(step))
        .filter(
          (previous) => previous.kind === 'navigate_section' || previous.kind === 'click',
        ).length;
      const successfulClicks = successful.filter((record) => record.action.kind === 'click').length;
      if (
        successfulClicks <= clickStepsBefore ||
        (step.finalImpact &&
          !successful.some((record) => record.action.kind === 'click' && record.action.highImpact))
      )
        return step;
      continue;
    }
    if (step.kind === 'assert') return undefined;
  }
  return undefined;
}

function workflowContext(step: WorkflowStep | undefined) {
  if (!step) return undefined;
  if (step.kind === 'navigate_section')
    return { kind: step.kind, target: step.target, allowedActions: ['click', 'wait'] };
  if (step.kind === 'fill_inputs')
    return {
      kind: step.kind,
      inputKeys: step.inputKeys,
      allowedActions: ['fill', 'select', 'check'],
    };
  if (step.kind === 'click')
    return {
      kind: step.kind,
      target: step.target,
      allowedActions: ['click'],
      finalImpact: step.finalImpact,
    };
  return { kind: step.kind, allowedActions: [] };
}

function locatorExpression(locator: { strategy: string; value: string }) {
  const value = JSON.stringify(locator.value);
  if (locator.strategy === 'getByLabel') return `getByLabel(${value})`;
  if (locator.strategy === 'getByPlaceholder') return `getByPlaceholder(${value})`;
  if (locator.strategy === 'getByText') return `getByText(${value})`;
  if (locator.strategy === 'testId') return `getByTestId(${value})`;
  if (locator.strategy === 'getByRole') {
    const [role, ...name] = locator.value.split(':');
    return `getByRole(${JSON.stringify(role)}, { name: ${JSON.stringify(name.join(':'))} })`;
  }
  return `locator(${value})`;
}

async function execute(
  page: Page,
  action: PlannedAction,
  inputs: Record<string, string>,
  approve: boolean,
  dryRun: boolean,
): Promise<ActionRecord> {
  if (action.kind === 'needs_review') return { action, status: 'blocked', error: action.reason };
  if (action.kind === 'click' && action.highImpact && !approve)
    return { action, status: 'blocked', error: 'requires --approve' };
  if (dryRun) return { action, status: 'planned' };
  try {
    if (action.kind === 'wait') await page.waitForLoadState('domcontentloaded');
    else if (action.kind === 'fill')
      await locatorFor(page, action.locator).fill(
        inputs[action.inputKey] ??
          (() => {
            throw new Error(`missing input: ${action.inputKey}`);
          })(),
      );
    else if (action.kind === 'select')
      await locatorFor(page, action.locator).selectOption(inputs[action.inputKey]);
    else if (action.kind === 'check')
      await locatorFor(page, action.locator).setChecked(inputs[action.inputKey] === 'true');
    else if (action.kind === 'click') {
      const beforeUrl = page.url();
      await locatorFor(page, action.locator).click();
      await Promise.race([
        page.waitForURL((url) => url.toString() !== beforeUrl, { timeout: 5_000 }),
        page.waitForTimeout(750),
      ]).catch(() => undefined);
      await page.waitForTimeout(3_000);
    }
    return { action, status: 'succeeded' };
  } catch (error) {
    return {
      action,
      status: 'failed',
      error: error instanceof Error ? error.message : 'unknown error',
    };
  }
}

async function readOptional(file: string) {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export async function runCordy(options: ParsedOptions, config?: CordyConfig) {
  const task = loadPrompt(options);
  const inputTemplates = loadInputs(options);
  const inputs = resolveInputRecord(inputTemplates);
  const startUrl = options.startUrl;
  const plan = createWorkflowPlan(task, inputs);
  const inferred = inferExpectations(task);
  const expectVisible = [...options.expectVisible, ...inferred.visible];
  const expectButtons = [...options.expectButtons, ...inferred.buttons];
  if (!startUrl) throw new Error('set --start-url to open the browser');
  if (options.output && options.testName)
    planManagedWrite(await readOptional(options.output), options.testName, options.update);
  const browser: Browser = await chromium.launch({ headless: !options.headed });
  const page = await browser.newPage();
  const actions: ActionRecord[] = [];
  try {
    await page.goto(startUrl);
    const jev = new JevClient({
      apiKey: config ? process.env[config.jev.apiKeyEnv] : undefined,
      endpoint: config?.jev.endpoint,
      verbose: options.verbose,
    });
    for (let step = 0; step < options.maxSteps; step += 1) {
      const recentActions = actions.slice(-5).map((record) => ({
        kind: record.action.kind,
        locator:
          'locator' in record.action
            ? `${record.action.locator.strategy}:${record.action.locator.value}`
            : undefined,
        inputKey: 'inputKey' in record.action ? record.action.inputKey : undefined,
        status: record.status,
      }));
      const workflowStep = currentWorkflowStep(plan, actions);
      const state = await observePage(
        page,
        task,
        `obs_${step + 1}`,
        recentActions,
        workflowContext(workflowStep),
      );
      let action = await jev.nextAction(state, inputs);
      if (workflowStep?.kind === 'click' && workflowStep.finalImpact && action.kind === 'click') {
        const emptyControls = state.interactiveElements
          .filter(
            (element) =>
              ['textbox', 'combobox'].includes(element.role) && element.valueState === 'empty',
          )
          .map((element) => element.name);
        if (emptyControls.length > 0)
          action = {
            kind: 'needs_review',
            reason: `Cannot execute ${workflowStep.target}: visible fields are still empty (${emptyControls.join(', ')})`,
          };
      }
      const record = await execute(page, action, inputs, true, options.dryRun);
      actions.push(record);
      if (options.verbose)
        console.error(JSON.stringify({ step: step + 1, action: record }, null, 2));
      if (record.status !== 'succeeded') break;
      if (record.action.kind === 'click' && record.action.highImpact) break;
    }
    const expectations = options.dryRun
      ? [
          ...expectVisible.map((text) => ({
            kind: 'visible',
            expected: text,
            status: 'planned' as const,
          })),
          ...expectButtons.map((button) => ({
            kind: 'button',
            expected: button,
            status: 'planned' as const,
          })),
          ...options.expectUrl.map((url) => ({
            kind: 'url',
            expected: url,
            status: 'planned' as const,
          })),
        ]
      : [
          ...(await Promise.all(
            expectVisible.map(async (text) => ({
              kind: 'visible' as const,
              expected: text,
              status: (await page
                .getByText(new RegExp(escapeRegex(text), 'i'))
                .first()
                .isVisible()
                .catch(() => false))
                ? ('passed' as const)
                : ('failed' as const),
            })),
          )),
          ...(await Promise.all(
            expectButtons.map(async (button) => ({
              kind: 'button' as const,
              expected: button,
              status: (await page
                .getByRole('button', { name: new RegExp(button, 'i') })
                .first()
                .isVisible()
                .catch(() => false))
                ? ('passed' as const)
                : ('failed' as const),
            })),
          )),
          ...options.expectUrl.map((url) => ({
            kind: 'url' as const,
            expected: url,
            status: page.url() === url ? ('passed' as const) : ('failed' as const),
          })),
        ];
    const result: {
      task: string;
      startUrl: string;
      headed: boolean;
      dryRun: boolean;
      plan: WorkflowPlan;
      actions: ActionRecord[];
      expectations: typeof expectations;
      output?: { file: string; written: boolean; message?: string };
      diff?: string;
    } = {
      task,
      startUrl,
      headed: options.headed,
      dryRun: options.dryRun,
      plan,
      actions,
      expectations,
    };
    if (options.output) {
      const inputSource: GeneratedInputSource = options.inputFile
        ? { kind: 'file', path: options.inputFile }
        : { kind: 'inline', values: inputTemplates };
      const decision = decideOutput({
        file: options.output,
        current: await readOptional(options.output),
        testName: options.testName,
        update: options.update,
        dryRun: options.dryRun,
        diff: options.diff,
        succeeded:
          actions.every((record) => record.status === 'succeeded') &&
          expectations.every((expectation) => expectation.status !== 'failed'),
        requiredImports: requiredImports(inputSource),
        renderFile: () =>
          generateTypeScript(
            actions,
            startUrl,
            options.outputKind,
            expectVisible,
            expectButtons,
            options.expectUrl,
            inputSource,
          ),
        renderBlock: () =>
          generateManagedBlock(
            options.testName as string,
            actions,
            startUrl,
            expectVisible,
            expectButtons,
            options.expectUrl,
            inputSource,
          ),
      });
      if (decision.write !== undefined) await writeFile(options.output, decision.write, 'utf8');
      result.output = {
        file: options.output,
        written: decision.write !== undefined,
        ...(decision.message ? { message: decision.message } : {}),
      };
      if (decision.diff !== undefined) result.diff = decision.diff;
    }
    return result;
  } finally {
    await browser.close();
  }
}
