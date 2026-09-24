import type { Page } from '@playwright/test';
import type { BrowserState, InteractiveElement } from './domain.js';

function redactValue(
  type: string | undefined,
  name: string,
  hasValue: boolean,
): InteractiveElement['valueState'] {
  const secret = type === 'password' || /password|token|secret|api.?key/i.test(name);
  return secret ? 'secret_or_redacted' : hasValue ? 'filled' : 'empty';
}

export async function observePage(
  page: Page,
  task: string,
  observationId: string,
  recentActions: BrowserState['recentActions'] = [],
  workflow?: BrowserState['workflow'],
): Promise<BrowserState> {
  const elements = (
    await page
      .locator(
        'input, textarea, select, button, a[href], [role="button"], [role="link"], [role="checkbox"], [role="radio"]',
      )
      .evaluateAll((nodes) =>
        nodes.map((node, index) => {
          const el = node as HTMLElement & {
            type?: string;
            name?: string;
            placeholder?: string;
            value?: string;
            disabled?: boolean;
            files?: FileList | null;
            multiple?: boolean;
          };
          const isFile = el.tagName.toLowerCase() === 'input' && el.type === 'file';
          const explicitLabel = (el as HTMLInputElement).labels?.[0]?.innerText?.trim();
          const label =
            el.getAttribute('aria-label') || explicitLabel || el.getAttribute('name') || undefined;
          const ancestorText = isFile
            ? (el.parentElement?.innerText?.trim().replace(/\s+/g, ' ').slice(0, 80) ?? '')
            : '';
          const name =
            label ||
            el.innerText?.trim() ||
            el.getAttribute('title') ||
            (isFile ? el.getAttribute('id') || ancestorText : '') ||
            `${el.tagName.toLowerCase()}-${index + 1}`;
          const role =
            (isFile ? 'file' : el.getAttribute('role')) ||
            (el.tagName.toLowerCase() === 'a'
              ? 'link'
              : el.tagName.toLowerCase() === 'button'
                ? 'button'
                : el.tagName.toLowerCase() === 'select'
                  ? 'combobox'
                  : 'textbox');
          const visible = (() => {
            const style = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return (
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              rect.width > 0 &&
              rect.height > 0
            );
          })();
          const id = el.getAttribute('id');
          const event = el.getAttribute('data-event');
          const fieldName = el.getAttribute('name');
          const uniqueSelector = event
            ? `[data-event="${event}"]`
            : id
              ? `#${id}`
              : isFile && fieldName
                ? `input[type="file"][name="${fieldName}"]`
                : isFile
                  ? `input[type="file"] >> nth=${[...document.querySelectorAll('input[type="file"]')].indexOf(el)}`
                  : undefined;
          return {
            id: `el_${index + 1}`,
            role,
            name,
            label,
            placeholder: el.placeholder || undefined,
            inputType: el.type,
            hasValue: isFile ? Boolean(el.files?.length) : Boolean(el.value),
            accept: isFile ? el.getAttribute('accept') || undefined : undefined,
            multiple: isFile ? Boolean(el.multiple) : undefined,
            uniqueSelector,
            valueState: 'empty' as const,
            visible,
            enabled: !el.disabled,
          };
        }),
      )
  ).filter((element) => element.visible || element.role === 'file');
  const interactiveElements: InteractiveElement[] = elements.map((element) => ({
    ...element,
    valueState: redactValue(element.inputType, element.name, element.hasValue),
    locatorCandidates: [
      ...(element.uniqueSelector
        ? [{ strategy: 'locator' as const, value: element.uniqueSelector }]
        : []),
      ...(element.role && element.name && element.role !== 'file'
        ? [{ strategy: 'getByRole' as const, value: `${element.role}:${element.name}` }]
        : []),
      ...(element.label ? [{ strategy: 'getByLabel' as const, value: element.label }] : []),
      ...(element.placeholder
        ? [{ strategy: 'getByPlaceholder' as const, value: element.placeholder }]
        : []),
    ],
  }));
  const visibleText = (await page.locator('body').innerText()).slice(0, 12_000);
  const url = page.url();
  return {
    task,
    page: { url, title: await page.title(), origin: new URL(url).origin },
    interactiveElements,
    visibleText,
    observationId,
    observedAt: new Date().toISOString(),
    recentActions,
    workflow,
  };
}
