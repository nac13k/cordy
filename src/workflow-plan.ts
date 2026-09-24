import { z } from 'zod';
import { collectExpectations, Expectation } from './expectation-spec.js';
import { inferExpectations } from './expectations.js';

const StepBase = z.object({ id: z.string(), status: z.literal('pending') });
export const WorkflowStep = z.discriminatedUnion('kind', [
  StepBase.extend({ kind: z.literal('navigate_section'), target: z.string().min(1) }),
  StepBase.extend({ kind: z.literal('fill_inputs'), inputKeys: z.array(z.string()).min(1) }),
  StepBase.extend({
    kind: z.literal('click'),
    target: z.string().min(1),
    finalImpact: z.boolean(),
  }),
  StepBase.extend({
    kind: z.literal('assert'),
    afterStep: z.string(),
    expectations: z.array(Expectation).min(1),
  }),
]);
export const WorkflowPlan = z.object({
  version: z.literal(1),
  source: z.string(),
  steps: z.array(WorkflowStep).min(1),
});
export type WorkflowStep = z.infer<typeof WorkflowStep>;
export type WorkflowPlan = z.infer<typeof WorkflowPlan>;

function clean(value: string) {
  return value
    .replace(/["“”']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:]+$/, '');
}

/**
 * Builds the plan from the prompt. `expectations` are the already collected CLI, alias, and
 * inferred expectations; when omitted, only prompt-inferred expectations are used.
 */
export function createWorkflowPlan(
  task: string,
  inputs: Record<string, string>,
  expectations?: Expectation[],
): WorkflowPlan {
  const normalized = task.replace(/\s+/g, ' ').trim();
  const steps: WorkflowStep[] = [];
  const section = normalized.match(
    /(?:entra|entrando|navega|navegando|ve)\s+a\s+la\s+secci[oó]n\s+(.+?)(?=\s+y\s+(?:simula|llena|completa)|\s*,|$)/i,
  )?.[1];
  if (section) {
    steps.push({
      id: 'step_1',
      kind: 'navigate_section',
      target: clean(section),
      status: 'pending',
    });
  }
  const inputKeys = Object.keys(inputs);
  if (inputKeys.length > 0)
    steps.push({
      id: `step_${steps.length + 1}`,
      kind: 'fill_inputs',
      inputKeys,
      status: 'pending',
    });
  const simulates = /\bsimular?\b|\bsimula\b|\bcalcula(?:r)?\b/i.test(normalized);
  if (simulates)
    steps.push({
      id: `step_${steps.length + 1}`,
      kind: 'click',
      target: 'simular',
      finalImpact: true,
      status: 'pending',
    });
  const assertions =
    expectations ??
    collectExpectations(
      {
        expect: [],
        expectVisible: [],
        expectButtons: [],
        expectUrl: [],
        inferred: inferExpectations(normalized),
      },
      [],
    );
  if (assertions.length > 0) {
    const previous = steps.at(-1)?.id ?? 'prompt';
    steps.push({
      id: `step_${steps.length + 1}`,
      kind: 'assert',
      afterStep: previous,
      expectations: assertions,
      status: 'pending',
    });
  }
  if (!steps.some((step) => step.kind !== 'assert'))
    throw new Error(
      'no plan could be derived from the prompt; describe the steps in a plan file and pass it with --plan (see cordy plan init)',
    );
  const plan = WorkflowPlan.parse({ version: 1, source: task, steps });
  const fillStep = plan.steps.find((step) => step.kind === 'fill_inputs');
  if (
    fillStep &&
    fillStep.inputKeys.some((key) => !Object.prototype.hasOwnProperty.call(inputs, key))
  )
    throw new Error(
      `Missing required input: ${fillStep.inputKeys.find((key) => !Object.prototype.hasOwnProperty.call(inputs, key))}`,
    );
  return plan;
}
