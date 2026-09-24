## 1. Spike

- [x] 1.1 Confirm that `expect` from `@playwright/test` works for locator and page assertions in a plain Node script (outside the test runner). Record the outcome in design.md and verify by running a throwaway script against `fixture/index.html`

## 2. Expectation model and parser

- [x] 2.1 Define the `Expectation` union and `parseExpectation(spec, inputKeys)` covering the kinds, the `not-` prefix (rejected on `count`), `value`/`count` separators, matcher parsing (substring, `/re/flags`, `${input.key}`), and error messages. Verify with a new `test/expectation-spec.test.ts` covering every kind, every rejection case in the spec, and URLs with colons
- [x] 2.2 Map `--expect-visible`, `--expect-button`, `--expect-url` (exact) and prompt-inferred expectations onto the union, with de-duplication. Verify with unit tests for alias equivalence and duplicate removal

## 3. CLI and plan

- [x] 3.1 Add the repeatable `--expect` flag to `src/cli-options.ts` and validate specs before launch (input references checked against provided input keys). Verify with `test/cli-options.test.ts` cases for valid specs, an unknown kind, and an unknown input reference
- [x] 3.2 Make the plan's `assert` step carry all expectations (CLI, aliases, inferred) as the new union. Verify with `test/workflow-plan.test.ts`

## 4. Live verification and reporting

- [x] 4.1 Implement `verify` with Playwright `expect` and a 5-second timeout, positives before negated, collecting `actual` on failure with redaction. Replace the three inline checks in `runCordy`. Verify with a browser test against a local fixture page covering a late-rendered text, a failed `value` with `actual`, and a redacted password field
- [x] 4.2 Add `spec`, `negated`, `actual`, and the vacuous-pass warning to the result, keeping the existing `kind`/`expected`/`status` fields. Verify with a run-output test asserting the JSON shape under `--dry-run` (`planned`) and a live run
- [x] 4.3 Assert in `test/jev.test.ts` that Jev request payloads contain no expectation specs or resolved values

## 5. Code generation

- [x] 5.1 Implement `render` for test output (positives first, then negated; input references as `input.<key>` expressions; escaping) and remove the parallel-array parameters from `testBody`/`generateManagedBlock`/`generateTypeScript`. Verify with `test/output.test.ts` snapshots per kind, including an input reference and a negated text
- [x] 5.2 Implement `render` for automation output using the approach confirmed in 1.1. Verify with an output test and by running a generated automation script against the fixture
- [x] 5.3 Export `escapeRegex` from `src/index.ts` and add it to the generated imports only when an expectation needs it. Verify with an output test that the import appears only then

## 6. Docs and checks

- [x] 6.1 Document `--expect`, the kinds table, the matcher rule, single-quote usage, evaluation order, and the aliases in `README.md` and `docs/USAGE.md`. Run `npm run format:check`, `npm run typecheck`, `npm test`, and `npm run build`, all passing
