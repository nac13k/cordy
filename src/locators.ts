import type { Locator, Page } from '@playwright/test';

export type LocatorLike = { strategy: string; value: string; nth?: number };

function baseLocator(page: Page, locator: LocatorLike): Locator {
  if (locator.strategy === 'getByLabel') return page.getByLabel(locator.value);
  if (locator.strategy === 'getByPlaceholder') return page.getByPlaceholder(locator.value);
  if (locator.strategy === 'getByText') return page.getByText(locator.value);
  if (locator.strategy === 'testId') return page.getByTestId(locator.value);
  if (locator.strategy === 'getByRole') {
    const [role, ...name] = locator.value.split(':');
    return page.getByRole(role as 'button' | 'textbox' | 'combobox', { name: name.join(':') });
  }
  return page.locator(locator.value);
}

/** The Playwright locator for a spec, pinned to one match when the spec has `nth`. */
export function locatorFor(page: Page, locator: LocatorLike): Locator {
  const base = baseLocator(page, locator);
  return locator.nth === undefined ? base : base.nth(locator.nth);
}

/** The same locator as generated TypeScript, without the leading `page.`. */
export function locatorExpression(locator: LocatorLike) {
  const value = JSON.stringify(locator.value);
  const nth = locator.nth === undefined ? '' : `.nth(${locator.nth})`;
  if (locator.strategy === 'getByLabel') return `getByLabel(${value})${nth}`;
  if (locator.strategy === 'getByPlaceholder') return `getByPlaceholder(${value})${nth}`;
  if (locator.strategy === 'getByText') return `getByText(${value})${nth}`;
  if (locator.strategy === 'testId') return `getByTestId(${value})${nth}`;
  if (locator.strategy === 'getByRole') {
    const [role, ...name] = locator.value.split(':');
    return `getByRole(${JSON.stringify(role)}, { name: ${JSON.stringify(name.join(':'))} })${nth}`;
  }
  return `locator(${value})${nth}`;
}
