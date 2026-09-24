import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

export const PLAN_MAX_STEPS = 50;
export const PLAN_MAX_STEP_LENGTH = 300;
const STEP_KEYS = ['click', 'submit', 'fill', 'wait'] as const;

const Target = z.string().trim().min(1);
/** Schema published by `cordy plan schema`. `validatePlanFile` enforces the same rules. */
export const PlanFile = z.strictObject({
  version: z.literal(1),
  description: z.string().trim().min(1).optional(),
  steps: z
    .array(
      z.union([
        z.string().trim().min(1).max(PLAN_MAX_STEP_LENGTH),
        z.strictObject({ click: Target }),
        z.strictObject({ submit: Target }),
        z.strictObject({ fill: z.array(z.string().trim().min(1)).min(1) }),
        z.strictObject({ wait: z.literal('load') }),
      ]),
    )
    .min(1)
    .max(PLAN_MAX_STEPS),
});
export type PlanFile = z.infer<typeof PlanFile>;

export type PlanFileStep =
  | { index: number; kind: 'natural'; text: string }
  | { index: number; kind: 'click' | 'submit'; target: string }
  | { index: number; kind: 'fill'; keys: string[] }
  | { index: number; kind: 'wait' };

export type LoadedPlan = { description?: string; steps: PlanFileStep[] };

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

function stepErrors(step: unknown, path: string): string[] {
  if (typeof step === 'string') {
    if (!step.trim()) return [`${path}: expected a non-empty step text`];
    if (step.length > PLAN_MAX_STEP_LENGTH)
      return [`${path}: step text must be at most ${PLAN_MAX_STEP_LENGTH} characters`];
    return [];
  }
  if (step === null || typeof step !== 'object' || Array.isArray(step))
    return [`${path}: expected a step text or an object with one of ${STEP_KEYS.join(', ')}`];
  const keys = Object.keys(step);
  if (keys.length !== 1 || !STEP_KEYS.includes(keys[0] as (typeof STEP_KEYS)[number]))
    return [
      `${path}: a step object must have exactly one key, one of ${STEP_KEYS.join(', ')} (got ${keys.join(', ') || 'none'})`,
    ];
  const [key] = keys;
  const value = (step as Record<string, unknown>)[key];
  if ((key === 'click' || key === 'submit') && !isNonEmptyString(value))
    return [`${path}.${key}: expected a non-empty target text`];
  if (
    key === 'fill' &&
    !(Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString))
  )
    return [`${path}.fill: expected a list of input keys, for example [amount, term]`];
  if (key === 'wait' && value !== 'load') return [`${path}.wait: expected "load"`];
  return [];
}

/** Validates a parsed plan document and returns errors as `location: message` lines. */
export function planFileErrors(raw: unknown): string[] {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
    return ['plan: expected a mapping with version and steps'];
  const plan = raw as Record<string, unknown>;
  const errors = Object.keys(plan)
    .filter((key) => !['version', 'description', 'steps'].includes(key))
    .map((key) => `${key}: unknown field (allowed: version, description, steps)`);
  if (plan.version !== 1) errors.push('version: expected 1');
  if (plan.description !== undefined && !isNonEmptyString(plan.description))
    errors.push('description: expected a non-empty text');
  if (!Array.isArray(plan.steps) || plan.steps.length === 0)
    errors.push('steps: expected a non-empty list of steps');
  else if (plan.steps.length > PLAN_MAX_STEPS)
    errors.push(`steps: at most ${PLAN_MAX_STEPS} steps are allowed (got ${plan.steps.length})`);
  else plan.steps.forEach((step, index) => errors.push(...stepErrors(step, `steps[${index}]`)));
  return errors;
}

export function parsePlanFile(source: string): LoadedPlan {
  let raw: unknown;
  try {
    raw = parseYaml(source);
  } catch (error) {
    throw new Error(`invalid plan: plan: not valid YAML (${(error as Error).message})`);
  }
  const errors = planFileErrors(raw);
  if (errors.length > 0)
    throw new Error(`invalid plan:\n${errors.map((e) => `  ${e}`).join('\n')}`);
  const plan = PlanFile.parse(raw);
  return {
    description: plan.description,
    steps: plan.steps.map((step, index): PlanFileStep => {
      if (typeof step === 'string') return { index, kind: 'natural', text: step.trim() };
      if ('click' in step) return { index, kind: 'click', target: step.click };
      if ('submit' in step) return { index, kind: 'submit', target: step.submit };
      if ('fill' in step) return { index, kind: 'fill', keys: step.fill };
      return { index, kind: 'wait' };
    }),
  };
}

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

/** Loads a plan from a path, or from stdin when the path is `-`. */
export async function loadPlanFile(path: string, stdin: () => Promise<string> = readStdin) {
  return parsePlanFile(path === '-' ? await stdin() : await readFile(path, 'utf8'));
}

export function describeStep(step: PlanFileStep) {
  if (step.kind === 'natural') return step.text;
  if (step.kind === 'fill') return `fill: [${step.keys.join(', ')}]`;
  if (step.kind === 'wait') return 'wait: load';
  return `${step.kind}: ${step.target}`;
}

/** The task text sent to Jev for a plan: its description, or the step texts. */
export function planTask(plan: LoadedPlan) {
  return plan.description ?? plan.steps.map(describeStep).join('\n');
}

export function planJsonSchema() {
  return z.toJSONSchema(PlanFile);
}

export const PLAN_TEMPLATE = `# Cordy plan (version 1). Validate it with: cordy plan check plan.yaml
version: 1

# Optional. Sent to Jev as the task description, so never put real values here.
description: Register a new account

# Steps run strictly in order. Each step is either:
#   - one instruction in natural language, in any language, describing ONE action; or
#   - an explicit form: { click: <text> }, { submit: <text> }, { fill: [keys] }, { wait: load }.
# Click and submit targets must appear in the step text as the control's visible name.
# Put quotes around the name for an exact match: clic en "Enviar".
# Values never go here: pass them with --input key=value or --file key=path.
steps:
  - da clic en la sección "Regístrate"
  - espera a que cargue
  - llena el formulario
  - submit: Crear cuenta
`;

const EMAIL = /[^\s@"'“”]+@[^\s@"'“”]+\.[^\s@"'“”]+/;
const LONG_NUMBER = /\d{4,}/;

/** Warnings for step texts or a description that look like they contain input values. */
export function planValueWarnings(plan: LoadedPlan) {
  const texts = [
    ...(plan.description ? [{ label: 'The plan description', text: plan.description }] : []),
    ...plan.steps.flatMap((step) =>
      step.kind === 'natural'
        ? [{ label: `Plan step ${step.index + 1} ("${step.text}")`, text: step.text }]
        : [],
    ),
  ];
  return texts
    .filter(({ text }) => EMAIL.test(text) || LONG_NUMBER.test(text))
    .map(
      ({ label }) =>
        `${label} may contain an input value, and it is sent to Jev; pass values with --input or --file`,
    );
}
