import { expect, type Locator, type Page } from '@playwright/test';
import {
  compileMatcher,
  escapeRegex,
  INPUT_REF,
  type Expectation,
  type Matcher,
} from './expectation-spec.js';

export const EXPECTATION_TIMEOUT_MS = 5_000;
const SENSITIVE_LABEL = /password|passwd|secret|token|api.?key/i;

export type ExpectationResult = {
  spec: string;
  kind: Expectation['kind'];
  negated: boolean;
  expected: string;
  status: 'planned' | 'passed' | 'failed';
  actual?: string | number;
};

/** Negated expectations run after positive ones, so they are checked against a settled page. */
export function evaluationOrder(expectations: Expectation[]) {
  return [
    ...expectations.filter((item) => !item.negated),
    ...expectations.filter((item) => item.negated),
  ];
}

export function vacuousPassWarning(expectations: Expectation[]) {
  return expectations.length > 0 && expectations.every((item) => item.negated)
    ? 'All expectations are negated; the run may have passed before the page reached its final state.'
    : undefined;
}

function visibleMatches(page: Page, expectation: Expectation, pattern: RegExp) {
  return expectation.kind === 'text'
    ? page.getByText(pattern).filter({ visible: true })
    : page.getByRole('button', { name: pattern }).filter({ visible: true });
}

async function assertExpectation(
  page: Page,
  expectation: Expectation,
  inputs: Record<string, string>,
) {
  const options = { timeout: EXPECTATION_TIMEOUT_MS };
  const pattern = 'matcher' in expectation ? compileMatcher(expectation.matcher, inputs) : /$^/;
  const not = expectation.negated;
  switch (expectation.kind) {
    case 'text':
    case 'button': {
      const matches = visibleMatches(page, expectation, pattern);
      if (not) await expect(matches).toHaveCount(0, options);
      else await expect(matches.first()).toBeVisible(options);
      return;
    }
    case 'button-enabled':
    case 'button-disabled': {
      const button = page.getByRole('button', { name: pattern }).first();
      const enabled = (expectation.kind === 'button-enabled') !== not;
      if (enabled) await expect(button).toBeEnabled(options);
      else await expect(button).toBeDisabled(options);
      return;
    }
    case 'url':
      if (not) await expect(page).not.toHaveURL(pattern, options);
      else await expect(page).toHaveURL(pattern, options);
      return;
    case 'title':
      if (not) await expect(page).not.toHaveTitle(pattern, options);
      else await expect(page).toHaveTitle(pattern, options);
      return;
    case 'value': {
      const field = page.getByLabel(expectation.label).first();
      if (not) await expect(field).not.toHaveValue(pattern, options);
      else await expect(field).toHaveValue(pattern, options);
      return;
    }
    case 'checked':
    case 'unchecked': {
      const field = page.getByLabel(expectation.label).first();
      if ((expectation.kind === 'checked') !== not) await expect(field).toBeChecked(options);
      else await expect(field).not.toBeChecked(options);
      return;
    }
    case 'count':
      await expect(page.getByText(pattern)).toHaveCount(expectation.count, options);
  }
}

async function isSensitiveField(field: Locator, label: string) {
  return SENSITIVE_LABEL.test(label) || (await field.getAttribute('type')) === 'password';
}

async function observedValue(
  page: Page,
  expectation: Expectation,
  inputs: Record<string, string>,
): Promise<string | number | undefined> {
  const pattern = 'matcher' in expectation ? compileMatcher(expectation.matcher, inputs) : /$^/;
  switch (expectation.kind) {
    case 'text':
    case 'button': {
      const first = visibleMatches(page, expectation, pattern).first();
      if (!(await first.count())) return undefined;
      const text = (await first.innerText()).trim().slice(0, 200);
      return text;
    }
    case 'button-enabled':
    case 'button-disabled': {
      const button = page.getByRole('button', { name: pattern }).first();
      if (!(await button.count())) return undefined;
      return (await button.isEnabled()) ? 'enabled' : 'disabled';
    }
    case 'url':
      return page.url();
    case 'title':
      return page.title();
    case 'value': {
      const field = page.getByLabel(expectation.label).first();
      if (!(await field.count())) return undefined;
      if (await isSensitiveField(field, expectation.label)) return '[redacted]';
      return field.inputValue();
    }
    case 'checked':
    case 'unchecked': {
      const field = page.getByLabel(expectation.label).first();
      if (!(await field.count())) return undefined;
      return (await field.isChecked()) ? 'checked' : 'unchecked';
    }
    case 'count':
      return page.getByText(pattern).count();
  }
}

function resultOf(
  expectation: Expectation,
  status: ExpectationResult['status'],
  actual?: string | number,
): ExpectationResult {
  return {
    spec: expectation.spec,
    kind: expectation.kind,
    negated: expectation.negated,
    expected: expectation.expected,
    status,
    ...(actual !== undefined ? { actual } : {}),
  };
}

export function plannedResults(expectations: Expectation[]) {
  return expectations.map((expectation) => resultOf(expectation, 'planned'));
}

export async function verifyExpectations(
  page: Page,
  expectations: Expectation[],
  inputs: Record<string, string>,
): Promise<ExpectationResult[]> {
  const check = async (expectation: Expectation) => {
    try {
      await assertExpectation(page, expectation, inputs);
      return resultOf(expectation, 'passed');
    } catch {
      const actual = await observedValue(page, expectation, inputs).catch(() => undefined);
      return resultOf(expectation, 'failed', actual);
    }
  };
  const results = new Map<Expectation, ExpectationResult>();
  for (const group of [
    expectations.filter((item) => !item.negated),
    expectations.filter((item) => item.negated),
  ])
    for (const [index, result] of (await Promise.all(group.map(check))).entries())
      results.set(group[index], result);
  return expectations.map((expectation) => results.get(expectation) as ExpectationResult);
}

/** JavaScript source for the RegExp of a matcher; input references read the generated `input`. */
function regexCode(matcher: Matcher) {
  if (matcher.inputRefs.length === 0) {
    const compiled = compileMatcher(matcher, {});
    return `new RegExp(${JSON.stringify(compiled.source)}, ${JSON.stringify(compiled.flags)})`;
  }
  const literal = matcher.type === 'substring';
  const source = matcher.source
    .split(INPUT_REF)
    .map((part, index) =>
      index % 2 === 1
        ? `escapeRegex(input[${JSON.stringify(part)}])`
        : part
          ? JSON.stringify(literal ? escapeRegex(part) : part)
          : '',
    )
    .filter(Boolean)
    .join(' + ');
  return `new RegExp(${source}, ${JSON.stringify(matcher.flags)})`;
}

export function needsEscapeRegex(expectations: Expectation[]) {
  return expectations.some((item) => 'matcher' in item && item.matcher.inputRefs.length > 0);
}

/** Playwright assertion lines equivalent to `assertExpectation`, in evaluation order. */
export function renderExpectations(expectations: Expectation[]) {
  return evaluationOrder(expectations).map((expectation) => {
    const re = 'matcher' in expectation ? regexCode(expectation.matcher) : '';
    const not = expectation.negated;
    const label = 'label' in expectation ? JSON.stringify(expectation.label) : '';
    switch (expectation.kind) {
      case 'text':
      case 'button': {
        const matches =
          expectation.kind === 'text'
            ? `page.getByText(${re}).filter({ visible: true })`
            : `page.getByRole('button', { name: ${re} }).filter({ visible: true })`;
        return not
          ? `  await expect(${matches}).toHaveCount(0);`
          : `  await expect(${matches}.first()).toBeVisible();`;
      }
      case 'button-enabled':
      case 'button-disabled': {
        const enabled = (expectation.kind === 'button-enabled') !== not;
        return `  await expect(page.getByRole('button', { name: ${re} }).first()).${enabled ? 'toBeEnabled' : 'toBeDisabled'}();`;
      }
      case 'url':
        return `  await expect(page)${not ? '.not' : ''}.toHaveURL(${re});`;
      case 'title':
        return `  await expect(page)${not ? '.not' : ''}.toHaveTitle(${re});`;
      case 'value':
        return `  await expect(page.getByLabel(${label}).first())${not ? '.not' : ''}.toHaveValue(${re});`;
      case 'checked':
      case 'unchecked': {
        const checked = (expectation.kind === 'checked') !== not;
        return `  await expect(page.getByLabel(${label}).first())${checked ? '' : '.not'}.toBeChecked();`;
      }
      case 'count':
        return `  await expect(page.getByText(${re})).toHaveCount(${expectation.count});`;
    }
  });
}
