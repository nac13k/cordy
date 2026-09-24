import { chromium, type Browser, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import type { ParsedOptions } from './cli-options.js';
import { loadInputs, loadPrompt } from './inputs.js';
import { locatorExpression, locatorFor } from './locators.js';
import { loadPlanFile, planTask, planValueWarnings } from './plan-file.js';
import { planFromPrompt } from './prompt-steps.js';
import {
  advanceCursor,
  pendingKeys,
  planReport,
  startCursor,
  stepsFromPlanFile,
  workflowContext,
  type PlanStep,
  type PlanStepReport,
} from './plan-steps.js';
import { JevClient, type StepKind } from './jev.js';
import type { CordyConfig } from './config.js';
import { observePage } from './observe.js';
import type { ActionRecord, PlannedAction } from './domain.js';
import { collectExpectations, type Expectation } from './expectation-spec.js';
import {
  needsEscapeRegex,
  plannedResults,
  renderExpectations,
  vacuousPassWarning,
  verifyExpectations,
} from './expectation-check.js';
import { parseBooleanInput, resolveInputRecord } from './dynamic-inputs.js';
import {
  decideOutput,
  planManagedWrite,
  renderImports,
  type RequiredImport,
} from './managed-output.js';

/** npm package name that generated code imports runtime helpers from. */
export const PACKAGE_NAME = '@nac13k/cordy';

export type GeneratedInputSource = (
  { kind: 'inline'; values: Record<string, string> } | { kind: 'file'; path: string }
) & { files?: Record<string, string[]> };

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

function cordyImportNames(actions: ActionRecord[], expectations: Expectation[]) {
  const checks = actions.some(
    (record) => record.status === 'succeeded' && record.action.kind === 'check',
  );
  return [
    'resolveInputRecord',
    ...(checks ? ['parseBooleanInput'] : []),
    ...(needsEscapeRegex(expectations) ? ['escapeRegex'] : []),
  ];
}
export function requiredImports(
  inputSource: GeneratedInputSource,
  actions: ActionRecord[] = [],
  expectations: Expectation[] = [],
): RequiredImport[] {
  return [
    { module: '@playwright/test', names: ['expect', 'test'] },
    ...(inputSource.kind === 'file' ? [{ module: 'node:fs', names: ['readFileSync'] }] : []),
    { module: PACKAGE_NAME, names: cordyImportNames(actions, expectations) },
  ];
}
function inputDeclaration(inputSource: GeneratedInputSource) {
  const input =
    inputSource.kind === 'inline'
      ? `  const input = ${inlineInputSource(inputSource.values)} as Record<string, string>;`
      : `  const input = resolveInputRecord(JSON.parse(readFileSync(${JSON.stringify(inputSource.path)}, 'utf8')) as Record<string, string>);`;
  const files = inputSource.files ?? {};
  return Object.keys(files).length > 0
    ? `${input}\n  const files: Record<string, string[]> = ${JSON.stringify(files)};`
    : input;
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
    if (action.kind === 'upload')
      lines.push(
        `  await page.${locatorExpression(action.locator)}.setInputFiles(files[${JSON.stringify(action.inputKey)}]);`,
      );
    if (action.kind === 'select')
      lines.push(
        `  await page.${locatorExpression(action.locator)}.selectOption(input.${action.inputKey});`,
      );
    if (action.kind === 'check')
      lines.push(
        `  await page.${locatorExpression(action.locator)}.setChecked(parseBooleanInput(input.${action.inputKey}, ${JSON.stringify(action.inputKey)}));`,
      );
    if (action.kind === 'click')
      lines.push(`  await page.${locatorExpression(action.locator)}.click();`);
    if (action.kind === 'wait')
      lines.push(`  await page.waitForLoadState('${action.state ?? 'domcontentloaded'}');`);
  }
  return lines;
}
function testBody(
  title: string,
  actions: ActionRecord[],
  startUrl: string | undefined,
  expectations: Expectation[],
  inputSource: GeneratedInputSource,
) {
  return [
    `test('${title.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}', async ({ page }) => {`,
    inputDeclaration(inputSource),
    ...actionLines(actions, startUrl),
    ...renderExpectations(expectations),
    '});',
  ];
}

export function generateManagedBlock(
  slug: string,
  actions: ActionRecord[],
  startUrl?: string,
  expectations: Expectation[] = [],
  inputSource: GeneratedInputSource = { kind: 'inline', values: {} },
) {
  return [
    `// cordy:begin ${slug}`,
    ...testBody(slug, actions, startUrl, expectations, inputSource),
    `// cordy:end ${slug}`,
  ].join('\n');
}

export function generateTypeScript(
  actions: ActionRecord[],
  startUrl?: string,
  outputKind: 'test' | 'automation' = 'test',
  expectations: Expectation[] = [],
  inputSource: GeneratedInputSource = { kind: 'inline', values: {} },
  testTitle = 'cordy automation',
) {
  if (outputKind === 'test')
    return [
      ...renderImports(requiredImports(inputSource, actions, expectations)),
      '',
      ...testBody(testTitle, actions, startUrl, expectations, inputSource),
      '',
      '// Inputs are intentionally external and must be provided by the generated consumer.',
    ].join('\n');
  const lines = [
    "import { chromium } from 'playwright';",
    ...(expectations.length > 0 ? ["import { expect } from '@playwright/test';"] : []),
    ...(inputSource.kind === 'file' ? ["import { readFileSync } from 'node:fs';"] : []),
    `import { ${cordyImportNames(actions, expectations).join(', ')} } from '${PACKAGE_NAME}';`,
    '',
    '(async () => {',
    inputDeclaration(inputSource),
    '  const browser = await chromium.launch({ headless: false });',
    '  const page = await browser.newPage();',
    ...actionLines(actions, startUrl),
  ];
  lines.push(...renderExpectations(expectations), '  await browser.close();', '})();');
  return lines.join('\n');
}
export function consumedInputKeys(actions: ActionRecord[]) {
  const keys = new Set<string>();
  for (const record of actions)
    if (record.status === 'succeeded' && 'inputKey' in record.action)
      keys.add(record.action.inputKey);
  return keys;
}
function describePlanStep(step: PlanStep) {
  return step.text ? `"${step.text}"` : `${step.kind}${step.target ? `: ${step.target}` : ''}`;
}

function requireInput(inputs: Record<string, string>, key: string) {
  if (!Object.prototype.hasOwnProperty.call(inputs, key)) throw new Error(`missing input: ${key}`);
  return inputs[key];
}

export async function execute(
  page: Page,
  action: PlannedAction,
  inputs: Record<string, string>,
  approve: boolean,
  dryRun: boolean,
  files: Record<string, string[]> = {},
): Promise<ActionRecord> {
  if (action.kind === 'needs_review') return { action, status: 'blocked', error: action.reason };
  if (action.kind === 'click' && action.highImpact && !approve)
    return { action, status: 'blocked', error: 'requires --approve' };
  if (dryRun) return { action, status: 'planned' };
  try {
    if (action.kind === 'wait') await page.waitForLoadState(action.state ?? 'domcontentloaded');
    else if (action.kind === 'fill')
      await locatorFor(page, action.locator).fill(requireInput(inputs, action.inputKey));
    else if (action.kind === 'upload') {
      if (!Object.prototype.hasOwnProperty.call(files, action.inputKey))
        throw new Error(`missing input: ${action.inputKey}`);
      await locatorFor(page, action.locator).setInputFiles(files[action.inputKey]);
    } else if (action.kind === 'select')
      await locatorFor(page, action.locator).selectOption(requireInput(inputs, action.inputKey));
    else if (action.kind === 'check')
      await locatorFor(page, action.locator).setChecked(
        parseBooleanInput(requireInput(inputs, action.inputKey), action.inputKey),
      );
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

/** Why a run did not fully succeed, or undefined when it did. Used for unwritten output. */
export function unsuccessfulRunReason(
  steps: PlanStep[],
  actions: ActionRecord[],
  recordSteps: number[],
  errors: string[],
  expectations: Array<{ spec: string; status: string }>,
) {
  const index = actions.findIndex((record) => record.status !== 'succeeded');
  if (index >= 0) {
    const record = actions[index];
    const step = steps.find((item) => item.index === recordSteps[index]);
    const detail = (record.error ?? ('reason' in record.action ? record.action.reason : ''))
      .split('\n')[0]
      .trim();
    const where = step ? `step ${step.index + 1} (${describePlanStep(step)})` : 'an action';
    const hint =
      record.status === 'blocked' && record.error === 'requires --approve'
        ? '; rerun with --approve to allow it'
        : '';
    return `${where} was ${record.status}${detail ? `: ${detail}` : ''}${hint}`;
  }
  if (errors.length > 0) return errors[0];
  const failed = expectations.find((expectation) => expectation.status === 'failed');
  return failed ? `expectation ${failed.spec} failed` : undefined;
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
  const prompt = options.plan ? undefined : loadPrompt(options);
  const planFile =
    prompt === undefined ? await loadPlanFile(options.plan as string) : planFromPrompt(prompt);
  const task = prompt ?? planTask(planFile);
  const { values: inputTemplates, files } = loadInputs(options);
  const inputs = resolveInputRecord(inputTemplates);
  const startUrl = options.startUrl;
  const expectationSpecs = collectExpectations(options, Object.keys(inputs));
  const allKeys = [...Object.keys(inputs), ...Object.keys(files)];
  if (!startUrl) throw new Error('set --start-url to open the browser');
  if (options.output && options.testName)
    planManagedWrite(await readOptional(options.output), options.testName, options.update);
  const jev = new JevClient({
    apiKey: config ? process.env[config.jev.apiKeyEnv] : undefined,
    endpoint: config?.jev.endpoint,
    verbose: options.verbose,
  });
  const naturalSteps = planFile.steps.flatMap((step) =>
    step.kind === 'natural' ? [{ index: step.index, text: step.text }] : [],
  );
  const classified = naturalSteps.length
    ? await jev.classifySteps(task, naturalSteps)
    : new Map<number, StepKind>();
  const steps = stepsFromPlanFile(planFile, (index) => classified.get(index) as StepKind);
  let cursor = startCursor();
  const errors: string[] = [];
  const recordSteps: number[] = [];
  const browser: Browser = await chromium.launch({ headless: !options.headed });
  const page = await browser.newPage();
  const actions: ActionRecord[] = [];
  try {
    await page.goto(startUrl);
    for (let step = 0; step < options.maxSteps; step += 1) {
      const planStep = steps[cursor.index];
      if (!planStep) break;
      let record: ActionRecord;
      if (planStep?.kind === 'wait')
        record = await execute(
          page,
          {
            kind: 'wait',
            state: 'load',
            reason: `Plan step ${planStep.index + 1} waits for the page load`,
          },
          inputs,
          true,
          options.dryRun,
          files,
        );
      else {
        const recentActions = actions.slice(-5).map((item) => ({
          kind: item.action.kind,
          locator:
            'locator' in item.action
              ? `${item.action.locator.strategy}:${item.action.locator.value}`
              : undefined,
          inputKey: 'inputKey' in item.action ? item.action.inputKey : undefined,
          status: item.status,
        }));
        const consumed = consumedInputKeys(actions);
        const state = await observePage(
          page,
          task,
          `obs_${step + 1}`,
          recentActions,
          workflowContext(
            planStep,
            planStep?.kind === 'fill' ? pendingKeys(planStep, allKeys, consumed) : [],
          ),
        );
        let action = await jev.nextAction(state, inputs, {
          consumedInputKeys: consumed,
          files,
          step: planStep,
        });
        if (action.kind === 'step_complete' && cursor.consumedInStep.length === 0)
          action = {
            kind: 'needs_review',
            reason: `Plan step ${(planStep?.index ?? 0) + 1} (${planStep ? describePlanStep(planStep) : 'fill'}) found no field for any pending input`,
          };
        if (planStep?.kind === 'submit' && action.kind === 'click')
          action = { ...action, highImpact: true };
        if (planStep?.kind === 'submit' && action.kind === 'click') {
          const emptyControls = state.interactiveElements
            .filter(
              (element) =>
                ['textbox', 'combobox'].includes(element.role) && element.valueState === 'empty',
            )
            .map((element) => element.name);
          if (emptyControls.length > 0)
            action = {
              kind: 'needs_review',
              reason: `Cannot execute ${planStep.target ?? planStep.text}: visible fields are still empty (${emptyControls.join(', ')})`,
            };
        }
        record =
          action.kind === 'step_complete'
            ? { action, status: 'succeeded' }
            : await execute(page, action, inputs, options.approve, options.dryRun, files);
      }
      actions.push(record);
      recordSteps.push(planStep?.index ?? -1);
      if (options.verbose)
        console.error(JSON.stringify({ step: step + 1, action: record }, null, 2));
      cursor = advanceCursor(
        steps,
        cursor,
        record.action.kind === 'step_complete'
          ? { type: 'no_input_key' }
          : { type: 'record', record },
        allKeys,
        consumedInputKeys(actions),
      ).cursor;
      if (record.status !== 'succeeded') break;
    }
    if (!options.dryRun) {
      const incomplete = steps[cursor.index];
      if (incomplete)
        errors.push(
          `Plan step ${incomplete.index + 1} (${describePlanStep(incomplete)}) was not completed`,
        );
      else {
        const consumed = consumedInputKeys(actions);
        const unused = allKeys.filter((key) => !consumed.has(key));
        if (unused.length > 0)
          errors.push(`The plan finished without using these inputs: ${unused.join(', ')}`);
      }
    }
    const expectations = options.dryRun
      ? plannedResults(expectationSpecs)
      : await verifyExpectations(page, expectationSpecs, inputs);
    const warnings = [
      ...planValueWarnings(planFile),
      ...[vacuousPassWarning(expectationSpecs)].filter((item): item is string => Boolean(item)),
    ];
    const result: {
      task: string;
      startUrl: string;
      headed: boolean;
      dryRun: boolean;
      planSteps: PlanStepReport[];
      errors?: string[];
      actions: ActionRecord[];
      expectations: typeof expectations;
      warnings?: string[];
      output?: { file: string; written: boolean; message?: string };
      diff?: string;
    } = {
      task,
      startUrl,
      headed: options.headed,
      dryRun: options.dryRun,
      planSteps: planReport(steps, actions, recordSteps, cursor),
      actions,
      expectations,
      ...(errors.length ? { errors } : {}),
      ...(warnings.length ? { warnings } : {}),
    };
    const skipReason = unsuccessfulRunReason(steps, actions, recordSteps, errors, expectations);
    if (options.output) {
      const inputSource: GeneratedInputSource = options.inputFile
        ? { kind: 'file', path: options.inputFile, files }
        : { kind: 'inline', values: inputTemplates, files };
      const decision = decideOutput({
        file: options.output,
        current: await readOptional(options.output),
        testName: options.testName,
        update: options.update,
        dryRun: options.dryRun,
        diff: options.diff,
        succeeded: !skipReason,
        reason: skipReason,
        requiredImports: requiredImports(inputSource, actions, expectationSpecs),
        renderFile: () =>
          generateTypeScript(actions, startUrl, options.outputKind, expectationSpecs, inputSource),
        renderBlock: () =>
          generateManagedBlock(
            options.testName as string,
            actions,
            startUrl,
            expectationSpecs,
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
