import { describe, expect, it, vi } from 'vitest';
import { JevClient } from '../src/jev.js';

describe('Jev planner', () => {
  it('sends redacted inputs and returns only an allowed action', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      expect(payload.state.inputs.email).toEqual({ available: true, type: 'provided_input' });
      expect(payload.state.inputs.password).toEqual({ available: true, type: 'provided_input' });
      return new Response(JSON.stringify({ answers: { action: { type: 'choice', choice: 'fill' }, target: { type: 'choice', choice: 'el_1' }, input_key: { type: 'choice', choice: 'email' } } }), { status: 200 });
    });
    const client = new JevClient({ apiKey: 'test-only', fetcher });
    const action = await client.nextAction({ task: 'fill', page: { url: 'https://example.test', title: 'Test', origin: 'https://example.test' }, interactiveElements: [{ id: 'el_1', role: 'textbox', name: 'Email', valueState: 'empty', visible: true, enabled: true, locatorCandidates: [{ strategy: 'getByLabel', value: 'Email' }] }], visibleText: 'Email', observationId: 'obs_1', observedAt: new Date().toISOString() }, { email: 'ana@example.com', password: 'do-not-send' });
    expect(action.kind).toBe('fill');
    if (action.kind === 'fill') expect(action.inputKey).toBe('email');
  });
  it('blocks an unknown or ambiguous action', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ answers: { action: { choice: 'needs_review' }, target: { choice: 'needs_review' } } }), { status: 200 }));
    const client = new JevClient({ apiKey: 'test-only', fetcher });
    const action = await client.nextAction({ task: 'x', page: { url: 'https://example.test', title: 'Test', origin: 'https://example.test' }, interactiveElements: [], visibleText: '', observationId: 'obs', observedAt: '' }, {});
    expect(action.kind).toBe('needs_review');
  });
});
