import { z } from 'zod';
import { inferExpectations } from './expectations.js';

const Expectation = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('visible_text'), value: z.string().min(1) }),
  z.object({ kind: z.literal('button'), name: z.string().min(1) }),
]);

const StepBase = z.object({ id: z.string(), status: z.literal('pending') });
export const WorkflowStep = z.discriminatedUnion('kind', [
  StepBase.extend({ kind: z.literal('navigate_section'), target: z.string().min(1) }),
  StepBase.extend({ kind: z.literal('fill_inputs'), inputKeys: z.array(z.string()).min(1) }),
  StepBase.extend({ kind: z.literal('click'), target: z.string().min(1), finalImpact: z.boolean() }),
  StepBase.extend({ kind: z.literal('assert'), afterStep: z.string(), expectations: z.array(Expectation).min(1) }),
]);
export const WorkflowPlan = z.object({ version: z.literal(1), source: z.string(), steps: z.array(WorkflowStep).min(1) });
export type WorkflowStep = z.infer<typeof WorkflowStep>;
export type WorkflowPlan = z.infer<typeof WorkflowPlan>;

function clean(value: string) { return value.replace(/["“”']/g, '').replace(/\s+/g, ' ').trim().replace(/[.,;:]+$/, ''); }

export function createWorkflowPlan(task: string, inputs: Record<string, string>): WorkflowPlan {
  const normalized = task.replace(/\s+/g, ' ').trim();
  const steps: WorkflowStep[] = [];
  const section = normalized.match(/(?:entra|entrando|navega|navegando|ve)\s+a\s+la\s+secci[oó]n\s+(.+?)(?=\s+y\s+(?:simula|llena|completa)|\s*,|$)/i)?.[1];
  if (section) {
    steps.push({ id: 'step_1', kind: 'navigate_section', target: clean(section), status: 'pending' });
    if (!/cotiza\s+tu\s+env[ií]o/i.test(section) && /simula(?:r)?\s+un\s+cr[eé]dito/i.test(normalized)) steps.push({ id: `step_${steps.length + 1}`, kind: 'click', target: 'cotiza tu envio', finalImpact: false, status: 'pending' });
  }
  const inputKeys = Object.keys(inputs);
  if (inputKeys.length > 0) steps.push({ id: `step_${steps.length + 1}`, kind: 'fill_inputs', inputKeys, status: 'pending' });
  const simulates = /\bsimular?\b|\bsimula\b|\bcalcula(?:r)?\b/i.test(normalized);
  if (simulates) steps.push({ id: `step_${steps.length + 1}`, kind: 'click', target: 'simular', finalImpact: true, status: 'pending' });
  const inferred = inferExpectations(normalized);
  const expectations: Array<z.infer<typeof Expectation>> = [
    ...inferred.visible.map(value => ({ kind: 'visible_text' as const, value })),
    ...inferred.buttons.map(name => ({ kind: 'button' as const, name })),
  ];
  if (expectations.length > 0) {
    const previous = steps.at(-1)?.id ?? 'prompt';
    steps.push({ id: `step_${steps.length + 1}`, kind: 'assert', afterStep: previous, expectations, status: 'pending' });
  }
  const plan = WorkflowPlan.parse({ version: 1, source: task, steps });
  const fillStep = plan.steps.find(step => step.kind === 'fill_inputs');
  if (fillStep && fillStep.inputKeys.some(key => !Object.prototype.hasOwnProperty.call(inputs, key))) throw new Error(`Falta el input requerido: ${fillStep.inputKeys.find(key => !Object.prototype.hasOwnProperty.call(inputs, key))}`);
  return plan;
}
