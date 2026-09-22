import type { Page } from '@playwright/test';
import type { BrowserState, InteractiveElement } from './domain.js';

function redactValue(type: string | undefined, name: string, hasValue: boolean): InteractiveElement['valueState'] {
  const secret = type === 'password' || /password|token|secret|api.?key/i.test(name);
  return secret ? 'secret_or_redacted' : hasValue ? 'filled' : 'empty';
}

export async function observePage(page: Page, task: string, observationId: string, recentActions: BrowserState['recentActions'] = []): Promise<BrowserState> {
  const elements = (await page.locator('input, textarea, select, button, [role="button"], [role="checkbox"], [role="radio"]').evaluateAll(nodes => nodes.map((node, index) => {
    const el = node as HTMLElement & { type?: string; name?: string; placeholder?: string; value?: string; disabled?: boolean };
    const explicitLabel = (el as HTMLInputElement).labels?.[0]?.innerText?.trim();
    const label = el.getAttribute('aria-label') || explicitLabel || el.getAttribute('name') || undefined;
    const name = label || el.innerText?.trim() || el.getAttribute('title') || `${el.tagName.toLowerCase()}-${index + 1}`;
    const role = el.getAttribute('role') || (el.tagName.toLowerCase() === 'button' ? 'button' : el.tagName.toLowerCase() === 'select' ? 'combobox' : 'textbox');
    const visible = (() => { const style = getComputedStyle(el); const rect = el.getBoundingClientRect(); return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0; })();
    const id = el.getAttribute('id');
    const event = el.getAttribute('data-event');
    const uniqueSelector = event ? `[data-event="${event}"]` : id ? `#${id}` : undefined;
    return { id: `el_${index + 1}`, role, name, label, placeholder: el.placeholder || undefined, inputType: el.type, hasValue: Boolean(el.value), uniqueSelector, valueState: 'empty' as const, visible, enabled: !el.disabled };
  }))).filter(element => element.visible);
  const interactiveElements: InteractiveElement[] = elements.map(element => ({ ...element, valueState: redactValue(element.inputType, element.name, element.hasValue), locatorCandidates: [
    ...(element.uniqueSelector ? [{ strategy: 'locator' as const, value: element.uniqueSelector }] : []),
    ...(element.role && element.name ? [{ strategy: 'getByRole' as const, value: `${element.role}:${element.name}` }] : []),
    ...(element.label ? [{ strategy: 'getByLabel' as const, value: element.label }] : []),
    ...(element.placeholder ? [{ strategy: 'getByPlaceholder' as const, value: element.placeholder }] : []),
  ] }));
  const visibleText = (await page.locator('body').innerText()).slice(0, 12_000);
  const url = page.url();
  return { task, page: { url, title: await page.title(), origin: new URL(url).origin }, interactiveElements, visibleText, observationId, observedAt: new Date().toISOString(), recentActions };
}
