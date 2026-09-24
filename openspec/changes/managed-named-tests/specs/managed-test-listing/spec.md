## Purpose

Lets users inspect which Cordy-managed test blocks a spec file contains, so they can find the slug to pass to `--test-name --update` and detect malformed markers.

## ADDED Requirements

### Requirement: List managed tests
The CLI SHALL provide `cordy tests <file>`, which reads the file without modifying it, never launches a browser or contacts Jev, and prints one entry per managed block with its slug, start line, end line, and status. Blocks SHALL be listed in file order.

#### Scenario: File with two blocks
- **WHEN** the user runs `cordy tests flows.spec.ts` on a file with valid blocks `cotizar-envio` (lines 5–21) and `login` (lines 24–38)
- **THEN** Cordy prints both slugs with their line ranges and status `ok`, and exits with code 0

#### Scenario: File without managed blocks
- **WHEN** the file exists but contains no Cordy markers
- **THEN** Cordy prints that no managed tests were found and exits with code 0

### Requirement: Report marker problems
`cordy tests` SHALL report malformed markers: `begin` without `end`, `end` without `begin`, nested blocks, a `begin`/`end` slug mismatch, duplicate slugs, and invalid slugs. Each problem SHALL be reported with its line number. When any problem is found, the exit code SHALL be 1.

#### Scenario: Missing end marker
- **WHEN** the file has `// cordy:begin checkout` at line 41 with no matching end
- **THEN** the `checkout` entry is reported with a missing-end problem at line 41 and the exit code is 1

#### Scenario: Duplicate slug
- **WHEN** two blocks in the file use slug `login`
- **THEN** both are reported with a duplicate-slug problem and the exit code is 1

### Requirement: JSON listing
With `--json`, `cordy tests <file>` SHALL print only a JSON document to stdout that contains the list of blocks (`slug`, `startLine`, `endLine` or null, `status`, and `problems`) and any problems not tied to a block.

#### Scenario: JSON output
- **WHEN** the user runs `cordy tests flows.spec.ts --json`
- **THEN** stdout parses as JSON and contains an entry for each managed block

### Requirement: Missing file
If the given file does not exist or no file argument is provided, `cordy tests` SHALL exit with code 1 and a clear error.

#### Scenario: Nonexistent file
- **WHEN** the user runs `cordy tests missing.spec.ts`
- **THEN** Cordy exits with code 1 and an error saying the file was not found
