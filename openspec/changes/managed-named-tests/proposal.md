## Why

Today `--output` always overwrites the whole target file with a single `test('cordy automation', ...)`. There is no way to keep several Cordy-generated tests in one spec file, and no way to regenerate one of them from a new prompt without losing the others. The output is also written even when the run failed or was a dry-run, so regenerating a test can silently replace a working test with a broken or empty one.

## What Changes

- New `--test-name <slug>` flag (only valid with `--output-kind test`). The generated test is wrapped in `// cordy:begin <slug>` / `// cordy:end <slug>` markers and titled `<slug>`. Code outside the markers is preserved.
- Without `--update`, Cordy appends the block to the end of the file. It fails if a block with that slug already exists.
- New `--update` flag (requires `--test-name`). It replaces the existing block with that slug and fails if the block does not exist.
- The file header imports are merged instead of duplicated when several blocks share a file. Files that exist but have no Cordy markers get the new block appended at the end.
- In managed mode (`--test-name`), Cordy never writes when any action or expectation failed.
- **BREAKING**: `--dry-run` never writes the output file. It prints a structural preview instead: the header import changes as a unified diff, plus whether the block would be appended or replaced and at which lines.
- New `--diff` flag. It runs the flow for real but, instead of writing, prints the unified diff between the current file and the file that would be written.
- New `cordy tests <file>` subcommand. It lists the Cordy-managed blocks in a file (slug, line range, status) and reports marker problems such as a missing `end`, duplicate slugs, or nested blocks. It also supports `--json`.
- Without `--test-name`, `--output` keeps today's behavior (full overwrite with `test('cordy automation', ...)`), except for the dry-run change above.
- No per-test settings are added to the TOML/YAML config. The config stays tool-level.

## Capabilities

### New Capabilities
- `managed-test-output`: Named, marker-delimited test blocks inside a generated spec file, covering insert/update semantics, header merging, write safety, dry-run preview, and `--diff`.
- `managed-test-listing`: The `cordy tests <file>` subcommand for inspecting managed blocks and detecting malformed markers.

### Modified Capabilities
<!-- None: no baseline specs exist yet under openspec/specs/. -->

## Impact

- **Code**: `src/cli-options.ts` (new flags and validation), `src/app.ts` (`tests` subcommand, help text), `src/run.ts` (`generateTypeScript` test title, write path, dry-run/diff behavior), and a new `src/managed-output.ts` module (marker parsing, block upsert, header merge). `src/index.ts` exports the listing/parsing API.
- **Dependencies**: adds the `diff` npm package for unified diff output.
- **CLI output**: under `--json`, previews and diffs go in a `diff` field so stdout stays valid JSON.
- **Docs**: `README.md` and `docs/USAGE.md` sections on `--output`.
- **Tests**: new vitest coverage for marker parsing, upsert conflicts, header merge, and CLI validation. No real Jev calls.
