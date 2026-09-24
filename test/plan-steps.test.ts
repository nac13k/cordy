import { describe, expect, it } from 'vitest';
import type { ActionRecord, PlannedAction } from '../src/domain.js';
import { parsePlanFile } from '../src/plan-file.js';
import {
  advanceCursor,
  startCursor,
  stepsFromPlanFile,
  workflowContext,
  type Cursor,
  type PlanStep,
} from '../src/plan-steps.js';

const locator = { strategy: 'locator' as const, value: '#x', confidence: 1, evidenceId: 'o' };
const ok = (action: PlannedAction): ActionRecord => ({ action, status: 'succeeded' });
const fill = (inputKey: string) => ok({ kind: 'fill', locator, inputKey, reason: 'r' });
const click = (highImpact = false) => ok({ kind: 'click', locator, reason: 'r', highImpact });

function run(steps: PlanStep[], keys: string[], events: Array<ActionRecord | 'none'>) {
  let cursor: Cursor = startCursor();
  const consumed = new Set<string>();
  const errors: string[] = [];
  for (const event of events) {
    if (event !== 'none' && event.status === 'succeeded' && 'inputKey' in event.action)
      consumed.add(event.action.inputKey);
    const result = advanceCursor(
      steps,
      cursor,
      event === 'none' ? { type: 'no_input_key' } : { type: 'record', record: event },
      keys,
      consumed,
    );
    cursor = result.cursor;
    if (result.error) errors.push(result.error);
  }
  return { index: cursor.index, errors };
}

// Spanish step texts on purpose: plan steps may be written in any language.
const wizard = stepsFromPlanFile(
  parsePlanFile(
    'version: 1\nsteps:\n  - llena el formulario\n  - clic en siguiente\n  - llena el formulario\n  - clic en "Enviar"\n',
  ),
  (index) => (index === 3 ? 'submit' : index % 2 === 0 ? 'fill' : 'click'),
);

describe('plan step cursor', () => {
  it('builds steps with anchors from the plan file', () => {
    expect(wizard.map((step) => [step.kind, step.anchor])).toEqual([
      ['fill', 'free'],
      ['click', 'free'],
      ['fill', 'free'],
      ['submit', 'quoted'],
    ]);
  });
  it('walks a two-screen wizard, ending each fill step on "no input key"', () => {
    const keys = ['name', 'email', 'id_document'];
    expect(
      run(wizard, keys, [fill('name'), fill('email'), 'none', click(), fill('id_document')]),
    ).toEqual({ index: 3, errors: [] });
  });
  it('rejects "no input key" before the fill step consumed anything', () => {
    expect(run(wizard, ['name'], ['none']).errors).toEqual([
      expect.stringMatching(/Step 1 \("llena el formulario"\) found no field/),
    ]);
  });
  it('completes a submit step only with a high-impact click', () => {
    const steps = stepsFromPlanFile(parsePlanFile('version: 1\nsteps: [{ submit: Send }]'), () => {
      throw new Error('no natural steps');
    });
    expect(run(steps, [], [click(false)]).index).toBe(0);
    expect(run(steps, [], [click(true)]).index).toBe(1);
  });
  it('completes an explicit fill when its listed keys are consumed', () => {
    const steps = stepsFromPlanFile(
      parsePlanFile('version: 1\nsteps: [{ fill: [a, b] }, { wait: load }]'),
      () => 'click',
    );
    expect(run(steps, ['a', 'b', 'c'], [fill('a')]).index).toBe(0);
    expect(run(steps, ['a', 'b', 'c'], [fill('a'), fill('b')]).index).toBe(1);
    expect(
      run(steps, ['a', 'b'], [fill('a'), fill('b'), ok({ kind: 'wait', reason: 'r' })]).index,
    ).toBe(2);
  });
  it('ignores failed records and never moves past the last step', () => {
    const [first] = wizard;
    expect(run([first], ['a'], [{ ...fill('a'), status: 'failed' }]).index).toBe(0);
    expect(run([first], ['a'], [fill('a'), click()]).index).toBe(1);
  });
  it('sends the step text and pending keys to Jev', () => {
    expect(workflowContext(wizard[0], ['email'])).toEqual({
      kind: 'fill',
      instruction: 'llena el formulario',
      inputKeys: ['email'],
      allowedActions: ['fill', 'select', 'check'],
    });
    expect(workflowContext(wizard[3], [])).toEqual({
      kind: 'submit',
      instruction: 'clic en "Enviar"',
      allowedActions: ['click'],
      finalImpact: true,
    });
  });
});
