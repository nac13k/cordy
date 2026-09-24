## Why

Cordy can only pass text-like values to a form. Many real forms require a document or image upload (ID scans, proof of address, attachments), so those flows cannot be automated or turned into tests today. File inputs are also usually hidden behind a styled button or drop zone, and `observePage` drops invisible elements, so Jev never even sees them.

## What Changes

- New repeatable `--file <key>=<path>[,<path>...]` flag. Paths are relative to the current working directory (expected to be the project root). They are validated before the browser launches: each must exist and be a readable regular file.
- The JSON inputs file accepts a typed entry: `{ "type": "file", "path": "…" }` or `{ "type": "file", "paths": ["…"] }`. Plain string, number, and boolean values keep their current meaning.
- A key cannot be provided both as a file and as a value.
- Observation includes `<input type="file">` elements even when hidden, with role `file`, their `accept` value, and whether they allow multiple files.
- Jev is told that a key is a file input (`type: 'file'`). It never receives paths, file names, sizes, or contents. Jev keeps choosing `fill`. Cordy turns a `fill` of a file key on a `file` element into a local `upload` action executed with `setInputFiles`.
- Cordy rejects (with `needs_review`) a file key on a non-file element, a value key on a file element, files that do not match the element's `accept` list, and several files on a single-file input.
- An upload consumes its key like any other input action.
- Generated code uploads with `setInputFiles`, using the same relative paths.
- Out of scope: inputs created only after a click (the file-chooser pattern), drag-and-drop without a file input, and synthetic fixture generation.

## Capabilities

### New Capabilities
- `file-upload-inputs`: Declaring file inputs (CLI and JSON), path validation, observation of file controls, the privacy boundary with Jev, upload execution and its safety checks, and code generation.

### Modified Capabilities
<!-- None: no baseline specs exist yet under openspec/specs/. -->

## Impact

- **Code**: `src/cli-options.ts` (`--file`), `src/inputs.ts` (typed JSON entries, path validation), `src/domain.ts` (`upload` in `PlannedAction`, `file` role, `accept`/`multiple` on `InteractiveElement`), `src/observe.ts` (hidden file inputs), `src/jev.ts` (input type metadata, file/value role checks, excluding file keys from the text-field re-matching heuristic), `src/run.ts` (execute and generate uploads), `src/dynamic-inputs.ts` (`resolveInputRecord` tolerates typed file entries).
- **Public API**: `resolveInputRecord` accepts a record containing typed file entries without failing. Existing callers are unaffected.
- **Depends on**: `fix-action-parity` (consumption tracking by key regardless of action kind).
- **Docs**: `README.md` and `docs/USAGE.md` input sections.
- **Invariants**: the list of actions Jev can choose is unchanged. `upload` is internal to Cordy.
