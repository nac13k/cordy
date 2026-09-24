import { chromium, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseBooleanInput } from '../src/dynamic-inputs.js';
import type { ActionRecord, PlannedAction } from '../src/domain.js';
import { consumedInputKeys, execute, generateTypeScript } from '../src/run.js';
import { createWorkflowPlan } from '../src/workflow-plan.js';
import { replayCursor, stepsFromWorkflowPlan } from '../src/plan-steps.js';

const locator = { strategy: 'getByLabel' as const, value: 'Field', confidence: 1, evidenceId: 'o' };

function fakePage() {
  const control = { fill: vi.fn(), selectOption: vi.fn(), setChecked: vi.fn(), click: vi.fn() };
  const page = { getByLabel: () => control } as unknown as Page;
  return { page, control };
}

describe('boolean input interpretation', () => {
  it('accepts true and false case-insensitively', () => {
    expect(parseBooleanInput('TRUE', 'accept')).toBe(true);
    expect(parseBooleanInput(' false ', 'accept')).toBe(false);
  });
  it('rejects other values naming the key and accepted values', () => {
    expect(() => parseBooleanInput('yes', 'accept')).toThrow(
      'invalid boolean input: accept must be true or false',
    );
  });
});

describe('input action execution', () => {
  it('unchecks a checkbox for the string false', async () => {
    const { page, control } = fakePage();
    const action: PlannedAction = { kind: 'check', locator, inputKey: 'accept', reason: 'r' };
    const record = await execute(page, action, { accept: 'false' }, true, false);
    expect(record.status).toBe('succeeded');
    expect(control.setChecked).toHaveBeenCalledWith(false);
  });
  it('fails a check with an invalid boolean value', async () => {
    const { page, control } = fakePage();
    const action: PlannedAction = { kind: 'check', locator, inputKey: 'accept', reason: 'r' };
    const record = await execute(page, action, { accept: 'yes' }, true, false);
    expect(record).toMatchObject({ status: 'failed', error: expect.stringMatching(/accept/) });
    expect(control.setChecked).not.toHaveBeenCalled();
  });
  it.each(['fill', 'select', 'check'] as const)('fails %s with a missing input', async (kind) => {
    const { page } = fakePage();
    const action = { kind, locator, inputKey: 'state', reason: 'r' } as PlannedAction;
    const record = await execute(page, action, {}, true, false);
    expect(record).toMatchObject({ status: 'failed', error: 'missing input: state' });
  });
});

describe('generated checkbox code', () => {
  const checked: ActionRecord = {
    action: { kind: 'check', locator, inputKey: 'accept', reason: 'r' },
    status: 'succeeded',
  };
  it('uses the shared boolean parser in test output', () => {
    const source = generateTypeScript([checked], undefined, 'test');
    expect(source).toContain('setChecked(parseBooleanInput(input.accept, "accept"))');
    expect(source).toContain(
      "import { resolveInputRecord, parseBooleanInput } from '@nac13k/cordy';",
    );
  });
  it('imports the parser in automation output only when needed', () => {
    expect(generateTypeScript([checked], undefined, 'automation')).toContain('parseBooleanInput }');
    expect(generateTypeScript([], undefined, 'automation')).not.toContain('parseBooleanInput');
  });
  it('evaluates the generated expression for "false" as unchecked', () => {
    const input = { accept: 'false' };
    expect(parseBooleanInput(input.accept, 'accept')).toBe(false);
  });
});

describe('input consumption', () => {
  const record = (kind: 'fill' | 'select' | 'check', inputKey: string): ActionRecord => ({
    action: { kind, locator, inputKey, reason: 'r' } as PlannedAction,
    status: 'succeeded',
  });
  it('completes the fill step when inputs are consumed by select and fill', () => {
    // Spanish prompt on purpose: the planner's regexes derive fill_inputs + final click from it.
    const plan = createWorkflowPlan('llena el formulario y simula el credito', {
      state: 'Jalisco',
      amount: '10',
    });
    const steps = stepsFromWorkflowPlan(plan);
    const keys = ['state', 'amount'];
    expect(steps[replayCursor(steps, [record('select', 'state')], keys).index]).toMatchObject({
      kind: 'fill',
      keys: ['state', 'amount'],
    });
    expect(
      steps[replayCursor(steps, [record('select', 'state'), record('fill', 'amount')], keys).index],
    ).toMatchObject({ kind: 'submit', target: 'simular' });
  });
  it('ignores failed actions', () => {
    expect(consumedInputKeys([{ ...record('check', 'accept'), status: 'failed' }]).size).toBe(0);
  });
});

describe('upload execution', () => {
  const uploadLocator = {
    strategy: 'locator' as const,
    value: '#doc',
    confidence: 1,
    evidenceId: 'o',
  };
  const upload: PlannedAction = {
    kind: 'upload',
    locator: uploadLocator,
    inputKey: 'id_document',
    reason: 'r',
  };
  it('sets the files on a hidden file input and consumes the key', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cordy-upload-'));
    const file = join(dir, 'id.pdf');
    writeFileSync(file, '%PDF');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(`
      <label for="doc">Upload document</label>
      <input type="file" id="doc" hidden onchange="document.getElementById('out').textContent = this.files[0].name">
      <p id="out"></p>`);
    const record = await execute(page, upload, {}, true, false, { id_document: [file] });
    expect(record.status).toBe('succeeded');
    await expect.poll(() => page.locator('#out').textContent()).toBe('id.pdf');
    expect(consumedInputKeys([record]).has('id_document')).toBe(true);
    await browser.close();
  });
  it('records a planned upload in dry-run without touching the page', async () => {
    const { page } = fakePage();
    const record = await execute(page, upload, {}, true, true, { id_document: ['./x.pdf'] });
    expect(record.status).toBe('planned');
  });
  it('fails an upload whose key has no files', async () => {
    const { page } = fakePage();
    expect(await execute(page, upload, {}, true, false)).toMatchObject({
      status: 'failed',
      error: 'missing input: id_document',
    });
  });
});
