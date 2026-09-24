## Why

Cordy can only assert three things today: visible text, a visible button, and an exact URL. That is not enough to catch real regressions in form flows: missing error messages, wrong calculated values, disabled buttons, or results that do not reflect the submitted inputs. The live checks also call `isVisible()`, which does not wait, while the generated spec uses `expect(...)`, which retries. A live run and its generated spec can therefore disagree. Cordy's commands are written by agents or technical users, so a compact, uniform CLI grammar fits better than more single-purpose flags.

## What Changes

- New repeatable `--expect '[not-]<kind>:<arg>'` flag. Kinds: `text`, `button`, `button-enabled`, `button-disabled`, `url`, `title`, `value`, `checked`, `unchecked`, `count`. The `not-` prefix negates any kind except `count`.
- One matcher rule for every kind: plain text is a case-insensitive substring, `/pattern/flags` is a regular expression, and `${input.<key>}` inserts the resolved value of a provided input.
- Expectations are validated before the browser launches. Unknown kinds, malformed arguments, invalid regexes, and unknown input references fail fast.
- Live verification uses the same retrying semantics as the generated spec. Negated expectations are evaluated after all positive ones. A run whose expectations are all negated gets a warning that it may pass vacuously.
- The run result reports each expectation as written (input references unresolved), its status, and the observed value on failure. Observed values from sensitive-looking fields are redacted.
- `--expect-visible`, `--expect-button`, and `--expect-url` stay as aliases for `text:`, `button:`, and an exact-match `url:`. Expectations inferred from Spanish prompts keep working.
- Fixes: regex metacharacters in button names and in generated `getByText` expectations are escaped, and explicit CLI expectations become part of the plan's `assert` step.
- Expectations stay CLI-only. There is no expectations file or config section.

## Capabilities

### New Capabilities
- `result-expectations`: The `--expect` grammar, supported kinds and matchers, validation, evaluation order and timing, result reporting, and code generation of assertions.

### Modified Capabilities
<!-- None: no baseline specs exist yet under openspec/specs/. -->

## Impact

- **Code**: new `src/expectations-spec.ts` (parser and `Expectation` union) or an extension of `src/expectations.ts`; `src/cli-options.ts` (`--expect`, aliases); `src/workflow-plan.ts` (assert step carries all expectations); `src/run.ts` (live verification, result shape, both code generators).
- **Result JSON**: each expectation entry gains `spec`, `negated`, and optional `actual` and `warning` fields. Existing `kind`/`expected`/`status` fields remain.
- **Generated code**: automation output gains assertions it could not express before.
- **Docs**: `README.md` and `docs/USAGE.md` expectation sections, including the single-quote requirement for `$` and `${...}`.
- **Privacy**: expectations are never sent to Jev.
