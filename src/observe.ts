import type { Page } from '@playwright/test';
import type { BrowserState, InteractiveElement } from './domain.js';
import { locatorFor } from './locators.js';

function redactValue(
  type: string | undefined,
  name: string,
  hasValue: boolean,
): InteractiveElement['valueState'] {
  const secret = type === 'password' || /password|token|secret|api.?key/i.test(name);
  return secret ? 'secret_or_redacted' : hasValue ? 'filled' : 'empty';
}

const SEMANTIC_SELECTOR =
  'input, textarea, select, button, a[href], [role="button"], [role="link"], [role="checkbox"], [role="radio"]';
/** Clickable elements beyond semantic controls; those without an ARIA role become `clickable`. */
const CLICKABLE_SELECTOR =
  '[role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="switch"], summary, a:not([href]), [onclick]';

export async function observePage(
  page: Page,
  task: string,
  observationId: string,
  recentActions: BrowserState['recentActions'] = [],
  workflow?: BrowserState['workflow'],
): Promise<BrowserState> {
  const elements = (
    await page.evaluate(
      ({ semanticSelector, clickableSelector }) => {
        const semantic = [...document.querySelectorAll<HTMLElement>(semanticSelector)];
        const extra = [...document.querySelectorAll<HTMLElement>(clickableSelector)].filter(
          (el) => !el.matches(semanticSelector),
        );
        const known = new Set<Element>([...semantic, ...extra]);
        const anyKnown = `${semanticSelector}, ${clickableSelector}`;
        // Outermost pointer-cursor elements (cards, custom buttons) with short visible text that
        // neither contain nor sit inside an observed control.
        const pointer = [...document.body.querySelectorAll<HTMLElement>('*')].filter((el) => {
          if (known.has(el) || getComputedStyle(el).cursor !== 'pointer') return false;
          const parent = el.parentElement;
          if (parent && getComputedStyle(parent).cursor === 'pointer') return false;
          const text = el.innerText?.trim().replace(/\s+/g, ' ') ?? '';
          if (text.length < 1 || text.length > 80) return false;
          return !el.querySelector(anyKnown) && !el.parentElement?.closest(anyKnown);
        });
        const all = new Set<HTMLElement>([...semantic, ...extra, ...pointer]);
        const nodes = [...document.querySelectorAll<HTMLElement>('*')].filter((el) => all.has(el));
        (window as unknown as { __cordyObserved?: Element[] }).__cordyObserved = nodes;
        return nodes.map((node, index) => {
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
          const tag = el.tagName.toLowerCase();
          const semanticTag =
            ['input', 'textarea', 'select', 'button'].includes(tag) ||
            (tag === 'a' && el.hasAttribute('href'));
          const clickable = !isFile && !el.getAttribute('role') && !semanticTag;
          const name =
            label ||
            (clickable
              ? // The first visible line (a card's heading), which getByText can match.
                el.innerText
                  ?.split('\n')
                  .map((line) => line.trim().replace(/\s+/g, ' '))
                  .find(Boolean)
              : el.innerText?.trim()) ||
            el.getAttribute('title') ||
            (isFile ? el.getAttribute('id') || ancestorText : '') ||
            `${el.tagName.toLowerCase()}-${index + 1}`;
          const role =
            (isFile ? 'file' : el.getAttribute('role')) ||
            (clickable
              ? 'clickable'
              : tag === 'a'
                ? 'link'
                : tag === 'button'
                  ? 'button'
                  : tag === 'select'
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
        });
      },
      { semanticSelector: SEMANTIC_SELECTOR, clickableSelector: CLICKABLE_SELECTOR },
    )
  ).filter((element) => element.visible || element.role === 'file');
  const interactiveElements: InteractiveElement[] = elements.map((element) => ({
    ...element,
    valueState: redactValue(element.inputType, element.name, element.hasValue),
    locatorCandidates: [
      ...(element.uniqueSelector
        ? [{ strategy: 'locator' as const, value: element.uniqueSelector }]
        : []),
      ...(element.role === 'clickable' && element.name
        ? [{ strategy: 'getByText' as const, value: element.name }]
        : []),
      ...(element.role && element.name && element.role !== 'file' && element.role !== 'clickable'
        ? [{ strategy: 'getByRole' as const, value: `${element.role}:${element.name}` }]
        : []),
      ...(element.label ? [{ strategy: 'getByLabel' as const, value: element.label }] : []),
      ...(element.placeholder
        ? [{ strategy: 'getByPlaceholder' as const, value: element.placeholder }]
        : []),
    ],
  }));
  await pinAmbiguousCandidates(page, interactiveElements);
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

/**
 * Adds `nth` to each element's first candidate when that locator matches several elements, so the
 * action acts on exactly the observed element. Positions follow Playwright's own matching. A match
 * that is not an observed node (for example the text span inside a clickable card) counts as the
 * innermost observed node that contains it.
 */
async function pinAmbiguousCandidates(page: Page, elements: InteractiveElement[]) {
  try {
    for (const element of elements) {
      const candidate = element.locatorCandidates[0];
      if (!candidate || candidate.strategy === 'locator') continue;
      const owners = await locatorFor(page, candidate).evaluateAll((matches) => {
        const observed = (window as unknown as { __cordyObserved?: Element[] }).__cordyObserved;
        return matches.map((match) => {
          const exact = observed?.indexOf(match) ?? -1;
          if (exact >= 0) return exact;
          let owner = -1;
          observed?.forEach((node, index) => {
            if (node.contains(match)) owner = index;
          });
          return owner;
        });
      });
      if (owners.length < 2) continue;
      const position = owners.indexOf(Number(element.id.slice(3)) - 1);
      if (position >= 0) candidate.nth = position;
    }
  } finally {
    await page.evaluate(() => {
      delete (window as unknown as { __cordyObserved?: Element[] }).__cordyObserved;
    });
  }
}
