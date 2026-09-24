## Why

A real run exposed three gaps in how Cordy finds and reports clicks.

- **Duplicate names:** a page repeated the link `Cotiza tu envío` four times. Jev picked one of them, but the locator `getByRole('link', { name: 'Cotiza tu envío' })` matched all four, so Playwright failed with a strict-mode violation. The user had to write "botón" in the step to steer Jev to a control with a unique selector.
- **Unclear skip message:** the same run did not write its `--test-name` output. The only explanation was "the run did not fully succeed", although the cause was a final click blocked for lack of `--approve`.
- **Unobserved controls:** Cordy only observes semantic controls (`button`, `a[href]`, form fields, and a few ARIA roles). Clickable cards, `<a>` without `href`, tabs, and menu items are invisible to Jev, so a click step cannot reach them.

## What Changes

- When a chosen control's locator matches more than one element on the page, Cordy pins it to the exact element Jev chose with its position (`.nth(i)`), both when executing and in generated code.
- Observation also includes tabs, menu items, options, switches, `<summary>`, `<a>` without `href`, elements with an `onclick` attribute, and the outermost elements rendered with `cursor: pointer` that have short visible text and contain no other observed control. They are reported with role `clickable` (or their ARIA role) and located by text.
- When managed output is not written because the run did not succeed, the message names the first cause, such as the blocked step and `requires --approve`, a failed action with its error, an incomplete step, an unused input, or a failed expectation.

## Capabilities

### New Capabilities
- `click-target-resolution`: turning the control Jev chose into a locator that matches only that element, and the set of page elements observed as clickable.
- `output-write-reasons`: reporting why managed output was left unchanged.

### Modified Capabilities
None.

## Impact

- Code:
  - `src/observe.ts`: selector set, clickable heuristic, and position computation;
  - `src/domain.ts`: `LocatorSpec` and locator candidates gain an optional `nth`;
  - `src/run.ts`: `locatorFor`, `locatorExpression`, and the output decision input;
  - `src/managed-output.ts`: `decideOutput` receives a reason.
- Generated tests can contain `.nth(i)`. That index depends on page order, which is documented.
- Jev receives more candidates on pages with clickable cards, which slightly increases observation size.
- Docs: README (supported controls, output messages) and CLAUDE.md (observation).
