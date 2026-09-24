## Purpose

Lets a Cordy flow upload local files into file inputs, without ever exposing paths, file names, or contents to Jev, and replays those uploads in generated code.

## ADDED Requirements

### Requirement: File flag
The CLI SHALL accept a repeatable `--file <key>=<path>[,<path>...]` flag. The key MUST follow the input key rules, and at least one path MUST be given. Paths SHALL be resolved relative to the current working directory. Every path MUST refer to an existing, readable regular file. Violations MUST be reported with exit code 1 before the browser launches or Jev is contacted, naming the key and the offending path.

#### Scenario: Single file
- **WHEN** the user runs from the project root with `--file id_document=./fixtures/id.pdf` and that file exists
- **THEN** the input `id_document` is a file input with one path

#### Scenario: Several files
- **WHEN** the user passes `--file attachments=./a.pdf,./b.pdf`
- **THEN** the input `attachments` is a file input with two paths, in that order

#### Scenario: Missing file
- **WHEN** the user passes `--file id_document=./fixtures/missing.pdf` and the file does not exist
- **THEN** Cordy exits with code 1 before launching the browser, naming `id_document` and `./fixtures/missing.pdf`

### Requirement: Typed file entries in the inputs file
The JSON inputs file SHALL accept an entry of the form `{ "type": "file", "path": "<path>" }` or `{ "type": "file", "paths": ["<path>", ...] }`, with the same path rules as `--file`. Paths SHALL be resolved relative to the current working directory, not to the inputs file. Any other object shape MUST be rejected, naming the key.

#### Scenario: Typed entry
- **WHEN** `inputs.json` contains `{ "proof": { "type": "file", "path": "./fixtures/proof.png" }, "name": "Ana" }`
- **THEN** `proof` is a file input and `name` is a value input

#### Scenario: Unknown object shape
- **WHEN** `inputs.json` contains `{ "proof": { "file": "./x.png" } }`
- **THEN** Cordy exits with code 1 before launching the browser, naming `proof`

### Requirement: Unique input keys
A key MUST NOT be provided both as a file input and as a value input. A conflict MUST be rejected before the browser launches.

#### Scenario: Key collision
- **WHEN** the user passes `--input doc=abc` and `--file doc=./a.pdf`
- **THEN** Cordy exits with code 1, naming `doc`

### Requirement: Observation of file controls
The page observation SHALL include every `<input type="file">` element, whether visible or not, with role `file`, the element's `accept` value when present, and whether it accepts multiple files. The observation MUST NOT include any selected file names.

#### Scenario: Hidden input behind a styled button
- **WHEN** the page has a visible "Upload document" button and a hidden `<input type="file" id="doc">`
- **THEN** the observation contains an element with role `file` for `#doc`

### Requirement: Jev privacy for file inputs
Jev SHALL be told, for each file input key, that it is a file input. Jev MUST NOT receive any path, file name, extension, size, or contents of a file input, and `--verbose` diagnostics MUST show only the key and the fact that it is a file.

#### Scenario: Request payload
- **WHEN** a run with `--file id_document=./fixtures/Ana_Lopez_ID.pdf` contacts Jev
- **THEN** the request describes `id_document` as a file input and contains neither `Ana_Lopez_ID` nor `fixtures`

### Requirement: Upload execution
When Jev proposes `fill` with a file input key on an element with role `file`, Cordy SHALL execute an upload that sets all of that key's files on the element and records it as an `upload` action for that key. A succeeded upload SHALL count as consuming the key. Cordy MUST return `needs_review` instead of acting when:
- a file input key targets an element whose role is not `file`,
- a value input key targets an element with role `file`,
- the element has an `accept` list and any file matches neither an accepted extension nor an accepted MIME type (derived from the file extension), or
- the key has more than one file and the element does not accept multiple files.

#### Scenario: Successful upload
- **WHEN** Jev proposes `fill` with `id_document` on the hidden `#doc` file input
- **THEN** Cordy sets `./fixtures/id.pdf` on `#doc`, records a succeeded `upload` for `id_document`, and treats the key as consumed

#### Scenario: Accept mismatch
- **WHEN** `id_document` is `./fixtures/id.pdf` and the target has `accept="image/*"`
- **THEN** Cordy returns `needs_review`, explaining that the file type is not accepted

#### Scenario: File key on a textbox
- **WHEN** Jev proposes `fill` with `id_document` on a textbox
- **THEN** Cordy returns `needs_review`

#### Scenario: Several files on a single-file input
- **WHEN** `attachments` has two files and the target has no `multiple` attribute
- **THEN** Cordy returns `needs_review`

### Requirement: Dry-run with file inputs
In `--dry-run`, file paths SHALL still be validated, and uploads SHALL be recorded as `planned` without setting any file.

#### Scenario: Dry-run upload
- **WHEN** a dry-run reaches an upload for `id_document`
- **THEN** the action is recorded as `planned` and no file is set on the page

### Requirement: Generated uploads
Generated test and automation code SHALL replay each succeeded upload by setting the same files, in the same order, using the same relative paths, on the same locator. Generated code MUST keep working when the inputs file contains typed file entries.

#### Scenario: Generated upload line
- **WHEN** a run with `--file id_document=./fixtures/id.pdf --output flow.spec.ts` succeeds
- **THEN** the generated test sets `./fixtures/id.pdf` on the recorded locator

#### Scenario: Inputs file with a typed entry
- **WHEN** the generated test reads an inputs file that contains a typed file entry
- **THEN** the value inputs still resolve and the test does not fail on the file entry
