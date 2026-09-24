import { PlannedAction } from './domain.js';
import { uploadProblem } from './file-inputs.js';
import type { BrowserState } from './domain.js';

export type JevTraceEvent = {
  event: 'request' | 'response' | 'error';
  endpoint: string;
  [key: string]: unknown;
};
export type JevClientOptions = {
  apiKey?: string;
  endpoint?: string;
  fetcher?: typeof fetch;
  verbose?: boolean;
  logger?: (event: JevTraceEvent) => void;
};
const DEFAULT_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

function safePage(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return '[invalid-url]';
  }
}
function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
/** Words that make a click high impact when they appear in the control's name (any case). */
export const HIGH_IMPACT_WORDS = [
  'submit',
  'enviar',
  'simular',
  'continuar',
  'confirmar',
  'calcular',
  'solicitar',
  'simulate',
  'calculate',
  'send',
  'confirm',
  'continue',
  'request',
  'apply',
  'pay',
  'purchase',
  'buy',
  'order',
  'delete',
  'remove',
] as const;
const HIGH_IMPACT_NAME = new RegExp(HIGH_IMPACT_WORDS.join('|'), 'i');
export function isHighImpactName(name: string) {
  return HIGH_IMPACT_NAME.test(name);
}
function normalizeForAnchor(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
/**
 * True when a control's name is anchored in a natural-language step: it equals a quoted segment
 * (`quoted`), or appears in the step text as whole words (`free`).
 */
export function anchoredIn(name: string, text: string, anchor: 'quoted' | 'free') {
  const candidate = normalizeForAnchor(name);
  if (anchor === 'quoted')
    return [...text.matchAll(/"([^"]+)"|“([^”]+)”/g)].some(
      (match) => normalizeForAnchor(match[1] ?? match[2]) === candidate,
    );
  return candidate.length >= 2 && ` ${normalizeForAnchor(text)} `.includes(` ${candidate} `);
}
function matchesTarget(name: string, target: string) {
  const words = normalizeText(target)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);
  const candidate = normalizeText(name);
  return words.length > 0 && words.every((word) => candidate.includes(word));
}
function summarizeAnswers(
  answers: Record<string, { type?: string; choice?: string; score?: number; noul?: number }>,
) {
  return Object.fromEntries(
    Object.entries(answers).map(([key, answer]) => [
      key,
      { type: answer.type, choice: answer.choice, score: answer.score, noul: answer.noul },
    ]),
  );
}

type JevResponseBody = {
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  answers?: Record<string, { type?: string; choice?: string; score?: number; noul?: number }>;
};

export const STEP_KINDS = ['click', 'fill', 'wait', 'submit'] as const;
export type StepKind = (typeof STEP_KINDS)[number];

export class JevClient {
  private readonly apiKey?: string;
  private readonly endpoint: string;
  private readonly fetcher: typeof fetch;
  private readonly logger?: (event: JevTraceEvent) => void;
  constructor(options: JevClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.JEV_API_KEY;
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.fetcher = options.fetcher ?? fetch;
    this.logger =
      options.logger ??
      (options.verbose ? (event) => console.error(`[jev] ${JSON.stringify(event)}`) : undefined);
  }
  private trace(event: JevTraceEvent) {
    this.logger?.(event);
  }
  available() {
    return Boolean(this.apiKey);
  }
  private async post(payload: unknown): Promise<JevResponseBody> {
    let response: Response;
    try {
      response = await this.fetcher(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + this.apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      this.trace({
        event: 'error',
        endpoint: this.endpoint,
        kind: error instanceof Error ? error.name : 'unknown',
        message: error instanceof Error ? error.message : 'request failed',
      });
      throw error;
    }
    if (!response.ok) {
      this.trace({ event: 'error', endpoint: this.endpoint, httpStatus: response.status });
      throw new Error(`Jev returned HTTP ${response.status}`);
    }
    const body = (await response.json()) as JevResponseBody;
    this.trace({
      event: 'response',
      endpoint: this.endpoint,
      httpStatus: response.status,
      model: body.model,
      answerKeys: Object.keys(body.answers ?? {}),
      answers: summarizeAnswers(body.answers ?? {}),
      usage: body.usage && {
        inputTokens: body.usage.input_tokens,
        outputTokens: body.usage.output_tokens,
      },
    });
    return body;
  }
  /**
   * Asks Jev to classify natural-language plan steps. Jev receives only the task and the step
   * texts. Throws, naming the step, on a compound step or a missing or invalid answer.
   */
  async classifySteps(
    task: string,
    steps: Array<{ index: number; text: string }>,
  ): Promise<Map<number, StepKind>> {
    if (!this.apiKey) throw new Error('Jev is not configured: set JEV_API_KEY');
    const criteria = {
      click: 'The step asks to click or open exactly one control, link, menu item, or section.',
      fill: 'The step asks to fill in, complete, upload into, or select values in form fields.',
      wait: 'The step asks to wait for the page to load or change.',
      submit: 'The step asks to submit, send, confirm, or finish the form with one final control.',
      compound: 'The step describes more than one of these actions.',
    };
    const questionIds = steps.map((step) => `step_${step.index}`);
    this.trace({
      event: 'request',
      endpoint: this.endpoint,
      model: 'jev-latest',
      purpose: 'classify_plan_steps',
      stepCount: steps.length,
      questionIds,
    });
    const body = await this.post({
      model: 'jev-latest',
      state: { task, plan: { steps } },
      questions: Object.fromEntries(
        steps.map((step) => [
          `step_${step.index}`,
          {
            type: 'choice',
            instructions: `Classify plan step ${step.index}: "${step.text}". Choose exactly one kind.`,
            criteria,
          },
        ]),
      ),
    });
    const kinds = new Map<number, StepKind>();
    for (const step of steps) {
      const choice = body.answers?.[`step_${step.index}`]?.choice;
      const label = `Plan step ${step.index + 1} ("${step.text}")`;
      if (choice === 'compound')
        throw new Error(
          `${label} describes more than one action; split it into separate steps (in a prompt, separate them with commas or line breaks)`,
        );
      if (!STEP_KINDS.includes(choice as StepKind))
        throw new Error(`${label} could not be classified by Jev (answer: ${choice ?? 'none'})`);
      kinds.set(step.index, choice as StepKind);
    }
    return kinds;
  }
  async nextAction(
    state: BrowserState,
    inputs: Record<string, string>,
    context: {
      consumedInputKeys?: Iterable<string>;
      files?: Record<string, string[]>;
      /** The current natural-language step, for anchoring and fill completion. */
      step?: {
        kind: string;
        anchor: 'explicit' | 'quoted' | 'free';
        text?: string;
        keys?: string[];
      };
    } = {},
  ): Promise<PlannedAction> {
    if (!this.apiKey) throw new Error('Jev is not configured: set JEV_API_KEY');
    const files = context.files ?? {};
    const fileKeys = new Set(Object.keys(files));
    const inputKeys = [...new Set([...Object.keys(inputs), ...fileKeys])];
    const candidates = state.interactiveElements.flatMap((element) =>
      element.locatorCandidates.map((locator) => ({
        elementId: element.id,
        role: element.role,
        valueState: element.valueState,
        ...locator,
      })),
    );
    const completedInputKeys = new Set(
      context.consumedInputKeys ??
        (state.recentActions ?? [])
          .filter((item) => item.status === 'succeeded' && item.inputKey)
          .map((item) => item.inputKey as string),
    );
    const allInputsFilled =
      inputKeys.length > 0 && inputKeys.every((key) => completedInputKeys.has(key));
    const actionInstructions = state.workflow
      ? `Current workflow step is ${state.workflow.kind}${state.workflow.target ? ` targeting "${state.workflow.target}"` : ''}. Allowed actions: ${state.workflow.allowedActions.join(', ')}. Do not skip this step or act on a later step.`
      : 'Choose the single next allowed browser action. For fill/select/check, the target must be an editable form control, never a button. Never invent an element or code.';
    const payload = {
      model: 'jev-latest',
      state: {
        ...state,
        inputs: Object.fromEntries(
          inputKeys.map((key) => [
            key,
            { available: true, type: fileKeys.has(key) ? 'file' : 'provided_input' },
          ]),
        ),
        workflow: { ...state.workflow, allInputsFilled },
      },
      questions: {
        action: {
          type: 'choice',
          instructions: actionInstructions,
          criteria: {
            fill: 'Fill a provided input into a visible textbox, combobox, or editable control.',
            click: 'Click the next control required by the requested test flow.',
            select: 'Select a provided value in a visible combobox.',
            check: 'Set a visible checkbox from a provided boolean-like input.',
            wait: 'Wait for the page to change.',
            needs_review: 'The action is ambiguous, unavailable, or high impact.',
          },
        },
        target: {
          type: 'choice',
          instructions: 'Choose the target candidate id for the action, or needs_review.',
          criteria: Object.fromEntries(
            candidates
              .map((candidate) => [
                candidate.elementId,
                `${candidate.strategy}:${candidate.value} (role=${candidate.role}, state=${candidate.valueState})`,
              ])
              .concat([['needs_review', 'No safe target']]),
          ),
        },
        input_key: {
          type: 'choice',
          instructions: 'Choose the provided input key required by the action, or none.',
          criteria: Object.fromEntries(
            inputKeys
              .map((key) => [key, `Provided ${fileKeys.has(key) ? 'file ' : ''}input ${key}`])
              .concat([['none', 'No input']]),
          ),
        },
      },
    };
    this.trace({
      event: 'request',
      endpoint: this.endpoint,
      model: 'jev-latest',
      observationId: state.observationId,
      page: safePage(state.page.url),
      inputKeys: inputKeys.map((key) => (fileKeys.has(key) ? `${key} (file)` : key)),
      candidateCount: candidates.length,
      questionIds: ['action', 'target', 'input_key'],
    });
    const body = await this.post(payload);
    const action = body.answers?.action?.choice;
    const target = body.answers?.target?.choice;
    let inputKey = body.answers?.input_key?.choice;
    const naturalFill = context.step?.kind === 'fill' && context.step.text && !context.step.keys;
    if (
      naturalFill &&
      (action === 'wait' ||
        (['fill', 'select', 'check'].includes(action ?? '') && (!inputKey || inputKey === 'none')))
    )
      return {
        kind: 'step_complete',
        reason: 'Jev found no visible field for the pending inputs on this screen',
      };
    if (!action || action === 'needs_review' || !target || target === 'needs_review')
      return { kind: 'needs_review', reason: 'Jev did not identify a safe action and target' };
    let element = state.interactiveElements.find((item) => item.id === target);
    let candidate = element?.locatorCandidates[0];
    if (
      action === 'fill' &&
      inputKey &&
      inputKey !== 'none' &&
      !fileKeys.has(inputKey) &&
      element?.role !== 'file' &&
      (!element ||
        !['textbox', 'combobox'].includes(element.role) ||
        element.valueState === 'filled')
    ) {
      const candidateKeys = [inputKey, ...inputKeys.filter((key) => key !== inputKey)].filter(
        (key) => !completedInputKeys.has(key) && !fileKeys.has(key),
      );
      for (const key of candidateKeys) {
        const keyParts = key
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((part) => part.length > 2);
        const matches = state.interactiveElements.filter(
          (item) =>
            ['textbox', 'combobox'].includes(item.role) &&
            item.locatorCandidates.some((itemCandidate) => {
              const candidateText = itemCandidate.value.toLowerCase();
              return keyParts.length > 0 && keyParts.every((part) => candidateText.includes(part));
            }),
        );
        if (matches.length === 1) {
          inputKey = key;
          element = matches[0];
          candidate = element.locatorCandidates[0];
          break;
        }
      }
    }
    if (state.workflow && !state.workflow.allowedActions.includes(action))
      return {
        kind: 'needs_review',
        reason: `Action ${action} is not allowed in workflow step ${state.workflow.kind}`,
      };
    if (!element || !candidate)
      return {
        kind: 'needs_review',
        reason: 'The proposed target does not exist in the current observation',
      };
    if (
      state.workflow &&
      ['click', 'submit'].includes(state.workflow.kind) &&
      action === 'click' &&
      state.workflow.target &&
      !matchesTarget(element.name, state.workflow.target)
    )
      return {
        kind: 'needs_review',
        reason: `Control "${element.name}" does not match the requested target "${state.workflow.target}"`,
      };
    const step = context.step;
    if (
      action === 'click' &&
      step?.text &&
      step.anchor !== 'explicit' &&
      !anchoredIn(element.name, step.text, step.anchor)
    )
      return {
        kind: 'needs_review',
        reason: `Control "${element.name}" is not named in the step "${step.text}"`,
      };
    const locator = {
      strategy: candidate.strategy,
      value: candidate.value,
      ...(candidate.nth === undefined ? {} : { nth: candidate.nth }),
      confidence: 0.5,
      evidenceId: state.observationId,
    } as const;
    if (['fill', 'select', 'check'].includes(action) && inputKey && fileKeys.has(inputKey)) {
      if (action !== 'fill' || element.role !== 'file')
        return {
          kind: 'needs_review',
          reason: `File input ${inputKey} can only be uploaded into a file control, not ${action} on role=${element.role}`,
        };
      const problem = uploadProblem(element, files[inputKey]);
      if (problem) return { kind: 'needs_review', reason: problem };
      return PlannedAction.parse({
        kind: 'upload',
        locator,
        inputKey,
        reason: 'Jev selected the file control for a provided file input',
      });
    }
    if (element.role === 'file')
      return {
        kind: 'needs_review',
        reason: `Jev proposed ${action} on a file control without a provided file input`,
      };
    if (
      ['fill', 'select', 'check'].includes(action) &&
      !['textbox', 'combobox', 'checkbox', 'radio'].includes(element.role)
    )
      return {
        kind: 'needs_review',
        reason: `Jev proposed ${action} on an element with role=${element.role}`,
      };
    if (action === 'fill' && inputKey && inputKey !== 'none')
      return PlannedAction.parse({
        kind: 'fill',
        locator,
        inputKey,
        reason: 'Jev selected the field and provided input',
      });
    if (action === 'select' && inputKey && inputKey !== 'none')
      return PlannedAction.parse({
        kind: 'select',
        locator,
        inputKey,
        reason: 'Jev selected the selector and provided value',
      });
    if (action === 'check' && inputKey && inputKey !== 'none')
      return PlannedAction.parse({
        kind: 'check',
        locator,
        inputKey,
        reason: 'Jev selected the checkbox and provided input',
      });
    if (action === 'click') {
      const highImpact = isHighImpactName(element.name);
      return PlannedAction.parse({
        kind: 'click',
        locator,
        reason: highImpact
          ? 'Jev selected a high-impact control; approval is required'
          : 'Jev selected a safe control',
        highImpact,
      });
    }
    if (action === 'wait')
      return { kind: 'wait', reason: 'Jev indicated that a page change should be observed' };
    return {
      kind: 'needs_review',
      reason: 'Jev response does not match an allowed action',
    };
  }
}
