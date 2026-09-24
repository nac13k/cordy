# result-expectations Specification

## Purpose
Lets users and agents declare the observable results a Cordy run must produce, with a single compact CLI grammar, and guarantees that the live run and the generated Playwright code verify them the same way.

## Requirements

### Requirement: Expectation flag grammar
The CLI SHALL accept a repeatable `--expect <spec>` flag. A spec MUST have the form `[not-]<kind>:<arg>`, split at the first `:`, so the argument may itself contain `:`. The supported kinds SHALL be `text`, `button`, `button-enabled`, `button-disabled`, `url`, `title`, `value`, `checked`, `unchecked`, and `count`. The `not-` prefix SHALL be accepted for every kind except `count`. Invalid specs MUST be rejected with exit code 1 before the browser launches or Jev is contacted, with an error that quotes the spec and lists the valid kinds.

#### Scenario: URL argument containing colons
- **WHEN** the user passes `--expect 'url:https://example.test/result'`
- **THEN** the expectation has kind `url` and argument `https://example.test/result`

#### Scenario: Unknown kind
- **WHEN** the user passes `--expect 'visible:Summary'`
- **THEN** Cordy exits with code 1 and an error quoting `visible:Summary` and listing the valid kinds, without launching the browser

#### Scenario: Negated count
- **WHEN** the user passes `--expect 'not-count:Row=3'`
- **THEN** Cordy exits with code 1 and an error saying `count` cannot be negated

### Requirement: Kind arguments and assertions
Each kind SHALL take the argument shape and assert the condition below, where `<m>` is a matcher, `<label>` is an accessible label, and `<n>` is a non-negative integer:

| Kind | Argument | Passes when |
|---|---|---|
| `text` | `<m>` | a visible element's text matches |
| `button` | `<m>` | a visible button's accessible name matches |
| `button-enabled` / `button-disabled` | `<m>` | a button whose accessible name matches is enabled / disabled |
| `url` | `<m>` | the page URL matches |
| `title` | `<m>` | the page title matches |
| `value` | `<label>=<m>` | the form control with that label has a value that matches (split at the first `=`) |
| `checked` / `unchecked` | `<label>` | the control with that label is checked / unchecked |
| `count` | `<m>=<n>` | exactly `<n>` elements have text that matches (split at the last `=`) |

A negated expectation SHALL pass when the corresponding condition does not hold. A `value` or `count` argument without its `=` separator, or a `count` whose `<n>` is not a non-negative integer, MUST be rejected before the browser launches.

#### Scenario: Calculated field value
- **WHEN** the user passes `--expect 'value:Monthly payment=1,250.00'` and the field labeled "Monthly payment" contains `$1,250.00`
- **THEN** the expectation passes

#### Scenario: Error message absent
- **WHEN** the user passes `--expect 'not-text:required field'` and no visible element contains that text at the end of the run
- **THEN** the expectation passes

#### Scenario: Count without number
- **WHEN** the user passes `--expect 'count:Result row'`
- **THEN** Cordy exits with code 1 before launching the browser, explaining that `count` requires `<matcher>=<n>`

### Requirement: Matcher syntax
Every `<m>` SHALL follow one rule regardless of kind. A value wrapped as `/pattern/flags` MUST be treated as a regular expression, where flags are a subset of `i`, `m`, `s`, and `u`. Any other value MUST be treated as a case-insensitive substring, with regex metacharacters matched literally. Inside either form, `${input.<key>}` SHALL be replaced with the resolved value of that provided input, inserted literally (escaped inside a regex). An invalid regex or a reference to a key that was not provided MUST be rejected before the browser launches.

#### Scenario: Literal metacharacters
- **WHEN** the user passes `--expect 'text:Total (MXN)'`
- **THEN** the expectation matches the literal text `Total (MXN)`, case-insensitively

#### Scenario: Regular expression
- **WHEN** the user passes `--expect 'url:/\/result\/\d+$/'`
- **THEN** the expectation passes only when the URL matches that pattern

#### Scenario: Input echo
- **WHEN** the user passes `--input amount=10000` and `--expect 'text:${input.amount}'`
- **THEN** the expectation passes when visible text contains `10000`

#### Scenario: Unknown input reference
- **WHEN** the user passes `--expect 'text:${input.missing}'` and no input `missing` is provided
- **THEN** Cordy exits with code 1 before launching the browser and names the missing key

### Requirement: Legacy expectation flags
`--expect-visible X` SHALL behave exactly like `--expect 'text:X'`, and `--expect-button X` like `--expect 'button:X'`. `--expect-url X` SHALL require the URL to equal `X` exactly. Cordy MUST NOT infer expectations from the prompt. Duplicate expectations (same kind, negation, and argument) SHALL be evaluated once.

#### Scenario: Alias equivalence
- **WHEN** the user passes both `--expect-visible Summary` and `--expect 'text:Summary'`
- **THEN** a single `text` expectation for `Summary` is evaluated and reported

#### Scenario: Exact URL alias
- **WHEN** the user passes `--expect-url https://example.test/result` and the final URL is `https://example.test/result?x=1`
- **THEN** the expectation fails

#### Scenario: No inference from the prompt
- **WHEN** a prompt step is `debe mostrar un botón de guardar cotización` and no expectation flag is passed
- **THEN** the run has no expectations

### Requirement: Evaluation timing and order
At the end of a live run, each expectation SHALL be verified with retries until it passes or a timeout of 5 seconds elapses, matching the semantics of the generated Playwright assertions. All positive expectations MUST be evaluated before any negated expectation. When every expectation of a run is negated, the result MUST include a warning that the run may pass without the page having reached its final state. In `--dry-run`, expectations SHALL be reported as `planned` and not evaluated. Any failed expectation SHALL make the exit code 1.

#### Scenario: Result renders late
- **WHEN** the expected text appears two seconds after the last action
- **THEN** the `text` expectation passes

#### Scenario: Negated after positive
- **WHEN** the user passes `--expect 'text:Summary'` and `--expect 'not-text:Error'`
- **THEN** `not-text:Error` is evaluated only after `text:Summary` has been evaluated

#### Scenario: Only negated expectations
- **WHEN** every expectation of a run is negated and all pass
- **THEN** the result includes a warning that the run may have passed vacuously

### Requirement: Expectation reporting
The run result SHALL list every expectation with its spec as written (input references unresolved), its kind, whether it is negated, and its status (`planned`, `passed`, or `failed`). A failed expectation SHALL include the observed value when one exists (text, URL, title, field value, checked state, or element count). The observed value of a field whose label or input type looks sensitive (password, secret, token, API key) MUST be redacted.

#### Scenario: Failed value reports actual
- **WHEN** `value:Amount=10000` fails because the field contains an empty string
- **THEN** the result entry has status `failed` and `actual` set to the empty string

#### Scenario: Sensitive field redacted
- **WHEN** `value:Password=secret` fails
- **THEN** the result entry's `actual` is redacted

### Requirement: Expectations stay local
Expectations and their resolved values MUST NOT be sent to Jev.

#### Scenario: Jev request
- **WHEN** a run with `--expect 'text:${input.amount}'` contacts Jev
- **THEN** no Jev request contains the expectation spec or the resolved value

### Requirement: Generated assertions
Generated test output SHALL contain one Playwright assertion per expectation that checks the same condition as the live verification, positives first and negated last. Input references SHALL be emitted as references to the generated `input` record, so they are re-evaluated on every run of the generated code. Generated automation output SHALL enforce every expectation and throw on the first one that does not hold.

#### Scenario: Input reference in generated test
- **WHEN** a run with `--input amount=10000 --expect 'text:${input.amount}' --output flow.spec.ts` succeeds
- **THEN** the generated assertion builds its matcher from `input.amount` rather than the literal `10000`

#### Scenario: Negated assertion in generated test
- **WHEN** a run with `--expect 'not-text:Error' --output flow.spec.ts` succeeds
- **THEN** the generated test asserts that no element with text matching `Error` is visible
