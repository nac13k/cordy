## Purpose

Lets several Cordy-generated Playwright tests live in one spec file as named, marker-delimited blocks, so each can be added or regenerated independently without touching the rest of the file.

## ADDED Requirements

### Requirement: Test name flag
The CLI SHALL accept `--test-name <slug>`, where the slug MUST match `^[a-z0-9]+(-[a-z0-9]+)*$` and be at most 64 characters. `--test-name` MUST be rejected unless `--output` is set and `--output-kind` is `test`. The validation errors SHALL be reported before the browser launches or Jev is contacted.

#### Scenario: Valid slug
- **WHEN** the user runs `cordy "..." --output flows.spec.ts --test-name cotizar-envio`
- **THEN** the options are accepted and the run proceeds

#### Scenario: Invalid slug
- **WHEN** the user passes `--test-name "Cotizar Envío"`
- **THEN** Cordy exits with code 1 and an error describing the slug format, without launching the browser

#### Scenario: Automation output kind
- **WHEN** the user passes `--test-name login --output-kind automation`
- **THEN** Cordy exits with code 1 and an error saying `--test-name` only applies to `--output-kind test`

#### Scenario: Missing output
- **WHEN** the user passes `--test-name login` without `--output`
- **THEN** Cordy exits with code 1 and an error saying `--test-name` requires `--output`

### Requirement: Managed block format
When `--test-name <slug>` is given, the generated test SHALL be written as a block that starts with a line `// cordy:begin <slug>` and ends with a line `// cordy:end <slug>`. The test inside the block SHALL be titled `<slug>`, and the block SHALL be self-contained, including its own input declaration. Leading whitespace on marker lines SHALL be tolerated when reading.

#### Scenario: Generated block shape
- **WHEN** a run with `--test-name login` succeeds
- **THEN** the file contains `// cordy:begin login`, then `test('login', async ({ page }) => { ... });`, then `// cordy:end login`

### Requirement: Insert new block
Without `--update`, Cordy SHALL append the block at the end of the output file, creating the file if it does not exist. If a block with the same slug already exists, Cordy MUST NOT write and SHALL exit with code 1 and an error that suggests `--update`. If the file exists but contains no Cordy markers, the block SHALL be appended and all existing content preserved.

#### Scenario: New file
- **WHEN** `--output flows.spec.ts --test-name login` succeeds and `flows.spec.ts` does not exist
- **THEN** the file is created with the required imports followed by the `login` block

#### Scenario: Append to file with other blocks
- **WHEN** `flows.spec.ts` contains a `checkout` block and a run with `--test-name login` succeeds
- **THEN** the `login` block is appended after the existing content and the `checkout` block is byte-for-byte unchanged

#### Scenario: Slug already exists
- **WHEN** `flows.spec.ts` already contains a `login` block and the user runs with `--test-name login` without `--update`
- **THEN** Cordy exits with code 1, the error mentions `--update`, and the file is not modified

#### Scenario: Existing file without markers
- **WHEN** `flows.spec.ts` contains hand-written tests and no Cordy markers
- **THEN** the new block is appended at the end and the hand-written content is preserved

### Requirement: Update existing block
The CLI SHALL accept `--update`, which MUST be rejected unless `--test-name` is also given. With `--update`, Cordy SHALL replace the lines from `// cordy:begin <slug>` through `// cordy:end <slug>` (inclusive) with the newly generated block, leaving all other content unchanged. If no block with that slug exists, Cordy MUST NOT write and SHALL exit with code 1.

#### Scenario: Replace block
- **WHEN** `flows.spec.ts` contains blocks `login` and `checkout`, and a run with `--test-name login --update` succeeds
- **THEN** only the `login` block content changes and it stays in its original position

#### Scenario: Update missing block
- **WHEN** the user runs `--test-name login --update` and the file has no `login` block
- **THEN** Cordy exits with code 1 with an error saying the block does not exist, and the file is not modified

#### Scenario: Update without test name
- **WHEN** the user passes `--update` without `--test-name`
- **THEN** Cordy exits with code 1 before launching the browser

### Requirement: Existence checks run before execution
Cordy SHALL validate the output file's markers and the insert/update preconditions before launching the browser. It SHALL validate them again immediately before writing, in case the file changed during the run.

#### Scenario: Conflict detected early
- **WHEN** the `login` block exists and the user runs `--test-name login` without `--update`
- **THEN** Cordy fails without launching the browser or calling Jev

### Requirement: Malformed markers block writing
If the output file contains malformed Cordy markers (a `begin` without a matching `end`, an `end` without a `begin`, nested blocks, mismatched slugs between `begin` and `end`, or duplicate slugs), Cordy MUST NOT write and SHALL exit with code 1 and an error that names the problem and its line.

#### Scenario: Missing end marker
- **WHEN** `flows.spec.ts` has `// cordy:begin login` with no `// cordy:end login`
- **THEN** any managed write to that file fails with an error naming line and slug, and the file is not modified

### Requirement: Header import merge
The file header SHALL contain every import the managed blocks need (`expect` and `test` from `@playwright/test`, `resolveInputRecord` from `cordy`, and `readFileSync` from `node:fs` when a block reads inputs from a file) exactly once. Missing imports SHALL be added without duplicating existing ones, and existing unrelated imports SHALL be preserved.

#### Scenario: Second block needs no new imports
- **WHEN** a second block that uses inline inputs is appended to a file that already has the Playwright and `cordy` imports
- **THEN** no import lines are added or duplicated

#### Scenario: Block needs an extra import
- **WHEN** a block that reads inputs from a JSON file is appended to a file without a `node:fs` import
- **THEN** `import { readFileSync } from 'node:fs';` is added to the header once

### Requirement: No managed write on failure
In managed mode, if any action or expectation has status `failed`, or the run stops on a status other than `succeeded`, Cordy MUST NOT modify the output file. It SHALL report that the file was left unchanged.

#### Scenario: Failed update keeps previous test
- **WHEN** `--test-name login --update` runs and an expectation fails
- **THEN** the existing `login` block is unchanged and the exit code is 1

### Requirement: Dry-run never writes output
With `--dry-run`, Cordy MUST NOT create or modify the `--output` file, whether or not `--test-name` is used. When `--output` is set, it SHALL print a structural preview: a unified diff of header import changes, plus a line stating whether the block would be appended or replaced (with the current line range when replacing). Insert/update conflicts SHALL still be reported as errors in dry-run.

#### Scenario: Dry-run update preview
- **WHEN** the user runs `--dry-run --output flows.spec.ts --test-name login --update` and `login` exists at lines 24–38
- **THEN** Cordy prints that block `login` (lines 24–38) would be replaced, and the file is not modified

#### Scenario: Dry-run legacy output
- **WHEN** the user runs `--dry-run --output flow.spec.ts` without `--test-name`
- **THEN** `flow.spec.ts` is not created or modified

### Requirement: Diff mode
The CLI SHALL accept `--diff`, which requires `--output` and MUST be rejected together with `--dry-run`. With `--diff`, Cordy SHALL execute the flow normally but, instead of writing, print a unified diff between the current output file (empty if missing) and the content that would be written. The same insert/update and failure rules apply to what would be written. It works with and without `--test-name`.

#### Scenario: Diff of an update
- **WHEN** the user runs `--output flows.spec.ts --test-name login --update --diff` and the run succeeds
- **THEN** a unified diff that touches only the `login` block is printed and the file is not modified

#### Scenario: Diff with dry-run
- **WHEN** the user passes both `--diff` and `--dry-run`
- **THEN** Cordy exits with code 1 before launching the browser

### Requirement: Diff output channel
Without `--json`, previews and diffs SHALL be printed to stdout. With `--json`, they MUST NOT be printed as plain text and SHALL be included as a `diff` string field in the JSON result, so stdout remains valid JSON.

#### Scenario: JSON diff
- **WHEN** the user runs with `--diff --json`
- **THEN** stdout is a single JSON document containing a `diff` field

### Requirement: Legacy output unchanged
Without `--test-name`, a non-dry-run `--output` SHALL keep today's behavior: it overwrites the whole file with a single test titled `cordy automation` (or the automation script for `--output-kind automation`).

#### Scenario: Legacy overwrite
- **WHEN** the user runs `--output flow.spec.ts` without `--test-name`
- **THEN** `flow.spec.ts` is fully replaced with the generated content, as before
