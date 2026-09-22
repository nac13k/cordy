import { PlannedAction } from './domain.js';
import type { BrowserState } from './domain.js';

export type JevClientOptions = { apiKey?: string; endpoint?: string; fetcher?: typeof fetch };
const DEFAULT_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

export class JevClient {
  private readonly apiKey?: string;
  private readonly endpoint: string;
  private readonly fetcher: typeof fetch;
  constructor(options: JevClientOptions = {}) { this.apiKey = options.apiKey ?? process.env.JEV_API_KEY; this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT; this.fetcher = options.fetcher ?? fetch; }
  available() { return Boolean(this.apiKey); }
  async nextAction(state: BrowserState, inputs: Record<string, string>): Promise<PlannedAction> {
    if (!this.apiKey) throw new Error('Jev no está configurado: define JEV_API_KEY');
    const candidates = state.interactiveElements.flatMap(element => element.locatorCandidates.map(locator => ({ elementId: element.id, ...locator })));
    const payload = { model: 'jev-latest', state: { ...state, inputs: Object.fromEntries(Object.keys(inputs).map(key => [key, { available: true, type: 'provided_input' }])) }, questions: {
      action: { type: 'choice', instructions: 'Choose the single next allowed browser action. Never invent an element or code.', criteria: { fill: 'Fill a provided input into a matching field.', click: 'Click a safe non-submitting control.', select: 'Select a provided value.', check: 'Set a checkbox from a provided boolean-like input.', wait: 'Wait for the page to change.', needs_review: 'The action is ambiguous, unavailable, or high impact.' } },
      target: { type: 'choice', instructions: 'Choose the target candidate id for the action, or needs_review.', criteria: Object.fromEntries(candidates.map(candidate => [candidate.elementId, `${candidate.strategy}:${candidate.value}`]).concat([['needs_review', 'No safe target']])) },
      input_key: { type: 'choice', instructions: 'Choose the provided input key required by the action, or none.', criteria: Object.fromEntries(Object.keys(inputs).map(key => [key, `Provided input ${key}`]).concat([['none', 'No input']])) },
    } };
    const response = await this.fetcher(this.endpoint, { method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(`Jev respondió HTTP ${response.status}`);
    const body = await response.json() as { answers?: Record<string, { type?: string; choice?: string }> };
    const action = body.answers?.action?.choice;
    const target = body.answers?.target?.choice;
    const inputKey = body.answers?.input_key?.choice;
    if (!action || action === 'needs_review' || !target || target === 'needs_review') return { kind: 'needs_review', reason: 'Jev no identificó una acción y objetivo seguros' };
    const element = state.interactiveElements.find(item => item.id === target);
    const candidate = element?.locatorCandidates[0];
    if (!element || !candidate) return { kind: 'needs_review', reason: 'El objetivo propuesto no existe en la observación actual' };
    const locator = { strategy: candidate.strategy, value: candidate.value, confidence: 0.5, evidenceId: state.observationId } as const;
    if (action === 'fill' && inputKey && inputKey !== 'none') return PlannedAction.parse({ kind: 'fill', locator, inputKey, reason: 'Jev seleccionó el campo y el input proporcionado' });
    if (action === 'select' && inputKey && inputKey !== 'none') return PlannedAction.parse({ kind: 'select', locator, inputKey, reason: 'Jev seleccionó el selector y el valor proporcionado' });
    if (action === 'check' && inputKey && inputKey !== 'none') return PlannedAction.parse({ kind: 'check', locator, inputKey, reason: 'Jev seleccionó el checkbox y el input proporcionado' });
    if (action === 'click') return PlannedAction.parse({ kind: 'click', locator, reason: 'Jev seleccionó un control seguro', highImpact: false });
    if (action === 'wait') return { kind: 'wait', reason: 'Jev indicó que debe observarse un cambio' };
    return { kind: 'needs_review', reason: 'La respuesta de Jev no coincide con una acción permitida' };
  }
}
