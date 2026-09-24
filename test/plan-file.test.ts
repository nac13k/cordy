import { describe, expect, it } from 'vitest';
import {
  loadPlanFile,
  parsePlanFile,
  planFileErrors,
  PlanFile,
  PLAN_TEMPLATE,
  planJsonSchema,
  planTask,
} from '../src/plan-file.js';

const yaml = (steps: string) => `version: 1\nsteps:\n${steps}\n`;

describe('plan file', () => {
  it('accepts natural-language and explicit steps', () => {
    // Spanish step texts on purpose: plans may be written in any language.
    const plan = parsePlanFile(
      yaml(
        [
          '  - da clic en la sección "Regístrate"',
          '  - espera a que cargue',
          '  - llena el formulario',
          '  - { submit: Enviar }',
          '  - click: Siguiente',
          '  - fill: [amount, term]',
          '  - wait: load',
        ].join('\n'),
      ),
    );
    expect(plan.steps).toEqual([
      { index: 0, kind: 'natural', text: 'da clic en la sección "Regístrate"' },
      { index: 1, kind: 'natural', text: 'espera a que cargue' },
      { index: 2, kind: 'natural', text: 'llena el formulario' },
      { index: 3, kind: 'submit', target: 'Enviar' },
      { index: 4, kind: 'click', target: 'Siguiente' },
      { index: 5, kind: 'fill', keys: ['amount', 'term'] },
      { index: 6, kind: 'wait' },
    ]);
  });
  it('accepts JSON documents', () => {
    expect(
      parsePlanFile('{"version":1,"description":"Sign up","steps":["click Sign up"]}'),
    ).toMatchObject({ description: 'Sign up', steps: [{ kind: 'natural' }] });
  });
  it.each([
    ['version: 2\nsteps: [a]', 'version: expected 1'],
    ['version: 1\nsteps: []', 'steps: expected a non-empty list of steps'],
    ['version: 1\nsteps: [a]\nextra: 1', 'extra: unknown field'],
    ['version: 1\ndescription: ""\nsteps: [a]', 'description: expected a non-empty text'],
    [yaml('  - { press: Enter }'), 'steps[0]: a step object must have exactly one key'],
    [yaml('  - { click: A, submit: B }'), 'steps[0]: a step object must have exactly one key'],
    [yaml('  - a\n  - b\n  - { fill: amount }'), 'steps[2].fill: expected a list of input keys'],
    [yaml('  - { click: "" }'), 'steps[0].click: expected a non-empty target text'],
    [yaml('  - { wait: 3 }'), 'steps[0].wait: expected "load"'],
    [yaml('  - ""'), 'steps[0]: expected a non-empty step text'],
    [yaml(`  - ${'x'.repeat(301)}`), 'steps[0]: step text must be at most 300 characters'],
    [yaml('  - [a, b]'), 'steps[0]: expected a step text or an object'],
    ['version: 1\nsteps: [\n', 'plan: not valid YAML'],
  ])('rejects %j', (source, message) => {
    expect(() => parsePlanFile(source)).toThrow(message);
  });
  it('limits plans to 50 steps', () => {
    const steps = Array.from({ length: 51 }, () => 'step');
    expect(planFileErrors({ version: 1, steps })).toEqual([
      'steps: at most 50 steps are allowed (got 51)',
    ]);
  });
  it('loads from stdin with -', async () => {
    const plan = await loadPlanFile('-', async () => yaml('  - click Sign up'));
    expect(plan.steps).toHaveLength(1);
  });
  it('uses the description or the step texts as the Jev task', () => {
    expect(planTask(parsePlanFile('version: 1\ndescription: Sign up\nsteps: [a]'))).toBe('Sign up');
    expect(planTask(parsePlanFile(yaml('  - open signup\n  - submit: Send')))).toBe(
      'open signup\nsubmit: Send',
    );
  });
  it('keeps the template valid under both validators', () => {
    expect(() => parsePlanFile(PLAN_TEMPLATE)).not.toThrow();
    expect(planJsonSchema()).toMatchObject({ type: 'object', required: ['version', 'steps'] });
  });
  it('agrees with the published schema on samples', () => {
    const samples: unknown[] = [
      { version: 1, steps: ['a', { click: 'b' }, { fill: ['k'] }, { wait: 'load' }] },
      { version: 1, steps: [{ fill: 'k' }] },
      { version: 1, steps: [{ wait: 3 }] },
      { version: 1, steps: [{ click: 'a', submit: 'b' }] },
      { version: 2, steps: ['a'] },
      { version: 1, steps: [] },
    ];
    for (const sample of samples)
      expect(PlanFile.safeParse(sample).success).toBe(planFileErrors(sample).length === 0);
  });
});
