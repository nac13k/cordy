## MODIFIED Requirements

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
