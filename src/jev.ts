import { PlannedAction } from './domain.js';
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
  async nextAction(state: BrowserState, inputs: Record<string, string>): Promise<PlannedAction> {
    if (!this.apiKey) throw new Error('Jev is not configured: set JEV_API_KEY');
    const candidates = state.interactiveElements.flatMap((element) =>
      element.locatorCandidates.map((locator) => ({
        elementId: element.id,
        role: element.role,
        valueState: element.valueState,
        ...locator,
      })),
    );
    const completedInputKeys = new Set(
      (state.recentActions ?? [])
        .filter((item) => item.status === 'succeeded' && item.kind === 'fill' && item.inputKey)
        .map((item) => item.inputKey as string),
    );
    const allInputsFilled =
      Object.keys(inputs).length > 0 &&
      Object.keys(inputs).every((key) => completedInputKeys.has(key));
    const actionInstructions = state.workflow
      ? `Current workflow step is ${state.workflow.kind}${state.workflow.target ? ` targeting "${state.workflow.target}"` : ''}. Allowed actions: ${state.workflow.allowedActions.join(', ')}. Do not skip this step or act on a later step.`
      : allInputsFilled
        ? 'All provided inputs are already filled. Choose the next safe click needed to complete the requested test flow, or wait. Do not choose fill.'
        : 'Choose the single next allowed browser action. For fill/select/check, the target must be an editable form control, never a button. Never invent an element or code.';
    const payload = {
      model: 'jev-latest',
      state: {
        ...state,
        inputs: Object.fromEntries(
          Object.keys(inputs).map((key) => [key, { available: true, type: 'provided_input' }]),
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
            Object.keys(inputs)
              .map((key) => [key, `Provided input ${key}`])
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
      inputKeys: Object.keys(inputs),
      candidateCount: candidates.length,
      questionIds: ['action', 'target', 'input_key'],
    });
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
    const body = (await response.json()) as {
      model?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
      answers?: Record<string, { type?: string; choice?: string; score?: number; noul?: number }>;
    };
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
    const action = body.answers?.action?.choice;
    const target = body.answers?.target?.choice;
    let inputKey = body.answers?.input_key?.choice;
    if (!action || action === 'needs_review' || !target || target === 'needs_review')
      return { kind: 'needs_review', reason: 'Jev did not identify a safe action and target' };
    let element = state.interactiveElements.find((item) => item.id === target);
    let candidate = element?.locatorCandidates[0];
    if (
      action === 'fill' &&
      inputKey &&
      inputKey !== 'none' &&
      (!element ||
        !['textbox', 'combobox'].includes(element.role) ||
        element.valueState === 'filled')
    ) {
      const inputKeys = [inputKey, ...Object.keys(inputs).filter((key) => key !== inputKey)].filter(
        (key) =>
          !state.recentActions?.some(
            (recent) =>
              recent.kind === 'fill' && recent.inputKey === key && recent.status === 'succeeded',
          ),
      );
      for (const key of inputKeys) {
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
    if (
      action === 'fill' &&
      element?.role === 'button' &&
      /simula|secci[oó]n|entrando|entrar/i.test(state.task)
    ) {
      const navigationButtons = state.interactiveElements.filter(
        (item) =>
          item.role === 'button' && /simula|iniciar|comenzar|mejora|cotizador/i.test(item.name),
      );
      const navigationButton =
        navigationButtons.find((item) =>
          state.workflow?.target
            ? matchesTarget(item.name, state.workflow.target)
            : item.locatorCandidates.some((itemCandidate) =>
                /cotizador[_-]iniciar/i.test(itemCandidate.value),
              ),
        ) ?? (navigationButtons.length === 1 ? navigationButtons[0] : undefined);
      if (navigationButton) {
        element = navigationButton;
        candidate = element.locatorCandidates[0];
        return PlannedAction.parse({
          kind: 'click',
          locator: {
            strategy: candidate.strategy,
            value: candidate.value,
            confidence: 0.5,
            evidenceId: state.observationId,
          },
          reason: 'Cordy corrected a fill proposal targeting the entry button',
          highImpact: false,
        });
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
      ['navigate_section', 'click'].includes(state.workflow.kind) &&
      action === 'click' &&
      state.workflow.target &&
      !matchesTarget(element.name, state.workflow.target)
    )
      return {
        kind: 'needs_review',
        reason: `Control "${element.name}" does not match the requested target "${state.workflow.target}"`,
      };
    if (
      ['fill', 'select', 'check'].includes(action) &&
      !['textbox', 'combobox', 'checkbox', 'radio'].includes(element.role)
    )
      return {
        kind: 'needs_review',
        reason: `Jev proposed ${action} on an element with role=${element.role}`,
      };
    const locator = {
      strategy: candidate.strategy,
      value: candidate.value,
      confidence: 0.5,
      evidenceId: state.observationId,
    } as const;
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
      const highImpact = /submit|enviar|simular|continuar|confirmar|calcular|solicitar/i.test(
        element.name,
      );
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
