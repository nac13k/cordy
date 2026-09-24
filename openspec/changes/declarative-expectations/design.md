## Context

Expectations are handled in three places today: live verification in `runCordy`, `testBody` for test output, and the automation branch of `generateTypeScript`. They are carried as three parallel string arrays (`expectVisible`, `expectButtons`, `expectUrl`). The `assert` step in `WorkflowPlan` only receives prompt-inferred expectations, and CLI expectations bypass it. Live checks use `isVisible()`, which does not wait.

## Goals / Non-Goals

**Goals:**
- One data model for expectations, used by parsing, live verification, reporting, and both code generators.
- Identical pass/fail semantics between a live run and its generated spec.

**Non-Goals:**
- Intermediate assertions between workflow steps. Expectations are evaluated once, at the end.
- Expectations loaded from a file or config.
- Network, download, or screenshot assertions.
- Locale-aware formatting of input references (for example `10000` → `$10,000.00`). Users can write a regex for now.

## Decisions

### A single `Expectation` union with three operations
```
parseExpectation(spec, inputKeys) → Expectation        (validation, before browser)
verify(page, e, inputs)          → { status, actual }  (live)
render(e, 'test' | 'automation') → string[]            (codegen)
```
The union holds `{ kind, negated, spec, args }`, where matcher arguments are `{ type: 'substring' | 'regex', source, flags, inputRefs }`. Legacy flags and prompt inference produce the same union. The three parallel arrays are removed. Alternative considered: keep the arrays and add more. Rejected, because every new kind would need three independent implementations.

### Live verification uses Playwright's `expect`
`@playwright/test` is already a dependency. The live check calls `expect(locator).toBeVisible({ timeout: 5000 })` and its equivalents (`toHaveURL`, `toHaveTitle`, `toHaveValue`, `toBeChecked`, `toBeEnabled`, `toHaveCount`, with `.not` for negation), catching the assertion error to produce `failed`. That gives the same retry semantics as the generated test for free. The observed value comes from a follow-up read (`innerText`, `inputValue`, `page.url()`, `count()`), done only on failure.

### Matching semantics per kind
- `text`: `page.getByText(regex).first()` visible. Negated: `page.getByText(regex)` has no visible match (`.not.toBeVisible()` on `.first()`).
- `button*`: `page.getByRole('button', { name: regex }).first()`.
- `value`, `checked`, `unchecked`: `page.getByLabel(label)`. The label uses Playwright's default substring matching.
- `count`: `page.getByText(regex)` with `toHaveCount(n)`.
- A substring matcher compiles to `new RegExp(escapeRegex(value), 'i')`. `--expect-url` compiles to `^escaped$`.

### Automation output uses `expect` from `@playwright/test`
Playwright's `expect` works outside the test runner for locator and page assertions, which keeps both outputs on one assertion vocabulary. **Confirmed (task 1.1):** a plain Node ESM script importing `{ chromium, expect }` from `@playwright/test` ran `toHaveTitle`, `toHaveURL`, `toBeVisible` (with retries on late-rendered text), `.not.toBeVisible`, `toHaveCount`, `toHaveValue`, `toBeChecked`, and `toBeDisabled` against `fixture/index.html` and inline content. A failing assertion throws `ExpectError`. The fallback polling helper is not needed. Automation output therefore imports `expect` from `@playwright/test`, which becomes a requirement for running generated automation scripts, just as it already is for test output.

### Input references
`${input.key}` is recognized only inside `--expect` arguments and is distinct from the dynamic-input templates (`timestamp()`, `faker.*`). At verification time it is replaced with the resolved input value, regex-escaped. In generated code it becomes a template expression over the `input` record, for example ``new RegExp(`${escapeRegex(input.amount)}`, 'i')``. This needs a small `escapeRegex` helper exported from `@nac13k/cordy` and added to the generated imports.

### Reporting keeps the unresolved spec
The result shows `spec` as written, so resolved input values (possibly sensitive) never reach stdout through expectations. `actual` is redacted using the same sensitivity test that `observe.ts` uses for `valueState`.

### Evaluation order
Positive expectations run in parallel, then negated ones run in parallel. The vacuous-pass warning is attached to the result, not printed separately, so `--json` stays clean.

## Risks / Trade-offs

- [Negated text via `.first()` only checks the first match] → Use `getByText(regex).filter({ visible: true })` with `toHaveCount(0)` when Playwright supports it. Otherwise, document the limitation.
- [A 5-second timeout per positive expectation makes failing runs slower] → Positives run in parallel, so a failing run waits about 5 seconds in total, not per expectation.
- [Shell expansion of `$` and `${...}` inside double quotes silently empties the argument] → Document single quotes prominently. Warn when a `text:` or `value:` argument is empty after parsing.
- [The result JSON shape grows] → Existing fields are kept; only fields are added.

## Migration Plan

This change is additive. Existing flags keep their meaning (the `--expect-url` exact match is preserved). Generated specs from earlier versions are unaffected. No rollback steps are needed beyond reverting the release.
