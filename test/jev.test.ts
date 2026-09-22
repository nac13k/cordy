import { describe, expect, it, vi } from 'vitest';
import { JevClient } from '../src/jev.js';

describe('Jev planner', () => {
  const state = { task: 'fill', page: { url: 'https://example.test/form?token=secret', title: 'Test', origin: 'https://example.test' }, interactiveElements: [{ id: 'el_1', role: 'textbox', name: 'Email', valueState: 'empty' as const, visible: true, enabled: true, locatorCandidates: [{ strategy: 'getByLabel' as const, value: 'Email' }] }], visibleText: 'Email', observationId: 'obs_1', observedAt: new Date().toISOString() };
  it('sends redacted inputs and returns only an allowed action', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      expect(payload.state.inputs.email).toEqual({ available: true, type: 'provided_input' });
      expect(payload.state.inputs.password).toEqual({ available: true, type: 'provided_input' });
      return new Response(JSON.stringify({ answers: { action: { type: 'choice', choice: 'fill' }, target: { type: 'choice', choice: 'el_1' }, input_key: { type: 'choice', choice: 'email' } } }), { status: 200 });
    });
    const client = new JevClient({ apiKey: 'test-secret', fetcher });
    const action = await client.nextAction(state, { email: 'ana@example.com', password: 'do-not-send' });
    expect(action.kind).toBe('fill');
    if (action.kind === 'fill') expect(action.inputKey).toBe('email');
  });
  it('emits safe verbose traces without the credential, input values, or query string', async () => {
    const logs: string[] = [];
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ model: 'jev-1.13.0', usage: { input_tokens: 10, output_tokens: 2 }, answers: { action: { choice: 'needs_review' }, target: { choice: 'needs_review' } } }), { status: 200 }));
    const client = new JevClient({ apiKey: 'test-secret', fetcher, verbose: true, logger: event => logs.push(JSON.stringify(event)) });
    await client.nextAction(state, { email: 'secret-email', password: 'secret-password' });
    const output = logs.join('\n');
    expect(output).toContain('request'); expect(output).toContain('response'); expect(output).toContain('httpStatus');
    expect(output).not.toContain('test-secret'); expect(output).not.toContain('secret-email'); expect(output).not.toContain('secret-password'); expect(output).not.toContain('token=secret');
  });
  it('blocks a navigation click whose accessible name does not match the current section', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ answers: { action: { choice: 'click' }, target: { choice: 'el_1' }, input_key: { choice: 'none' } } }), { status: 200 }));
    const client = new JevClient({ apiKey: 'test-only', fetcher });
    const action = await client.nextAction({ ...state, workflow: { kind: 'navigate_section', target: 'cotizador de envios', allowedActions: ['click', 'wait'] }, interactiveElements: [{ ...state.interactiveElements[0], id: 'el_1', role: 'button', name: 'Cotiza tu envío', locatorCandidates: [{ strategy: 'getByRole' as const, value: 'button:Cotiza tu envío' }] }] }, {});
    expect(action).toMatchObject({ kind: 'needs_review' });
  });
  it('blocks an unknown or ambiguous action', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ answers: { action: { choice: 'needs_review' }, target: { choice: 'needs_review' } } }), { status: 200 }));
    const client = new JevClient({ apiKey: 'test-only', fetcher });
    const action = await client.nextAction({ ...state, interactiveElements: [], visibleText: '', observationId: 'obs' }, {});
    expect(action.kind).toBe('needs_review');
  });
});
