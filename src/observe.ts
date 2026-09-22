import type { Page } from '@playwright/test';
import type { BrowserState, InteractiveElement } from './domain.js';

function redactValue(type: string | undefined, name: string): InteractiveElement['valueState'] {
  const secret = type === 'password' || /password|token|secret|api.?key/i.test(name);
  return secret ? 'secret_or_redacted' : 'empty';
}

export async function observePage(page: Page, task: string, observationId: string): Promise<BrowserState> {
  const elements = await page.locator('input, textarea, select, button, [role="button"], [role="checkbox"], [role="radio"]').evaluateAll(nodes => nodes.map((node, index) => {
    const el = node as HTMLElement & { type?: string; name?: string; placeholder?: string; value?: string; disabled?: boolean };
    const label = el.getAttribute('aria-label') || el.getAttribute('name') || undefined;
    const name = label || el.innerText?.trim() || el.getAttribute('title') || `${el.tagName.toLowerCase()}-${index + 1}`;
    const role = el.getAttribute('role') || (el.tagName.toLowerCase() === 'button' ? 'button' : el.tagName.toLowerCase() === 'select' ? 'combobox' : 'textbox');
    return { id: `el_${index + 1}`, role, name, label, placeholder: el.placeholder || undefined, inputType: el.type, valueState: 'empty' as const, visible: true, enabled: !el.disabled };
  }));
  const interactiveElements: InteractiveElement[] = elements.map(element => ({ ...element, valueState: redactValue(element.inputType, element.name), locatorCandidates: [
    ...(element.role && element.name ? [{ strategy: 'getByRole' as const, value: `${element.role}:${element.name}` }] : []),
    ...(element.label ? [{ strategy: 'getByLabel' as const, value: element.label }] : []),
    ...(element.placeholder ? [{ strategy: 'getByPlaceholder' as const, value: element.placeholder }] : []),
  ] }));
  const visibleText = (await page.locator('body').innerText()).slice(0, 12_000);
  const url = page.url();
  return { task, page: { url, title: await page.title(), origin: new URL(url).origin }, interactiveElements, visibleText, observationId, observedAt: new Date().toISOString() };
}
