## Purpose

Tells users why a managed `--test-name` output was left unchanged, so they can fix the run without digging through the JSON result.

## ADDED Requirements

### Requirement: Reason for an unwritten managed output
When managed output is not written because the run did not succeed, the message SHALL be `<file> left unchanged: <reason>`, where the reason is the first applicable of:
1. the first action whose status is not `succeeded`, as `step <n> ("<step>") was <status>: <error or reason>`;
2. the first error in the result;
3. the first failed expectation, as `expectation <spec> failed`.

When the first cause is a click blocked with `requires --approve`, the message SHALL end with `; rerun with --approve to allow it`.

#### Scenario: Blocked final click
- **WHEN** a run with `--test-name cotizacion` is blocked at step 4 `da click en simular` for lack of `--approve`
- **THEN** the message is `<file> left unchanged: step 4 ("da click en simular") was blocked: requires --approve; rerun with --approve to allow it`

#### Scenario: Failed action
- **WHEN** step 2 fails with a Playwright error
- **THEN** the message names step 2, the status `failed`, and the first line of the error

#### Scenario: Failed expectation
- **WHEN** every action succeeds and the expectation `text:Resumen` fails
- **THEN** the message is `<file> left unchanged: expectation text:Resumen failed`
