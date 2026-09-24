## 1. Pinned locators

- [x] 1.1 Add optional `nth` (non-negative integer) to `LocatorSpec` and to locator candidates in `src/domain.ts`, and verify with `npm run typecheck`
- [x] 1.2 In `src/observe.ts`, keep the observed nodes in a page-scoped array, resolve each element's first non-unique candidate with `locatorFor`, set `nth` when it matches several elements, and clean up the array; verify with an observe test on a page with four links named `Cotiza tu envío` and with buttons `Simular` / `Simular de nuevo`
- [x] 1.3 Carry `nth` from the chosen candidate into the action in `src/jev.ts`, apply it in `run.ts:locatorFor`, and render `.nth(n)` in `locatorExpression`; verify with a run test that clicks the third repeated link and a codegen test for `.nth(2)`

## 2. Clickable elements

- [x] 2.1 Extend the observation selector with the tab, menuitem, option, and switch roles, `summary`, `a:not([href])`, and `[onclick]`, and add the outermost `cursor: pointer` pass with the text and containment filters, verified by observe tests for a clickable card, a button inside a card, and a tab
- [x] 2.2 Give non-ARIA elements role `clickable` with a `getByText` candidate, allow click and reject fill/select/check on them in `src/jev.ts`, verified by Jev validation tests

## 3. Output reasons

- [x] 3.1 Build the skip reason in `src/run.ts` (first non-succeeded record with its step, then first error, then first failed expectation, plus the `--approve` hint) and pass it to `decideOutput`, verified by tests for the blocked-click, failed-action, and failed-expectation scenarios

## 4. Docs and checks

- [x] 4.1 Document observed control types, `.nth(n)` in generated tests, and the skip messages in README.md, and update the observation notes in CLAUDE.md
- [x] 4.2 Run `npm run format:check`, `npm run typecheck`, `npm test`, and `npm run build`, and verify that all pass
