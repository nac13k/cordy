## Context

`runCordy` (`src/run.ts`) ends by calling `writeFile(options.output, generateTypeScript(...))` unconditionally, even for failed runs and dry-runs. `generateTypeScript` builds the whole file as one array of lines: the imports, `test('cordy automation', ...)` with the `input` declaration inside the test body, then a trailing comment. Because the input declaration already lives inside the test body, every test is self-contained except for the imports. `app.ts:main` already dispatches one subcommand (`init`) before flag parsing. See proposal.md for motivation and the specs for the required behavior.

## Goals / Non-Goals

**Goals:**
- Pure, easily unit-tested functions for parsing markers, planning an insert/update, and merging imports, with no filesystem or browser access.
- Fail fast: conflicts and malformed files are detected before the browser launches.
- Keep the legacy (no `--test-name`) generation path intact.

**Non-Goals:**
- Parsing TypeScript into an AST, or understanding code outside markers.
- Managed blocks for `--output-kind automation`.
- Storing the prompt or run metadata in the block.
- Renaming or deleting blocks through the CLI (users can edit the file by hand).
- Per-test settings in the config file.

## Decisions

### A new `src/managed-output.ts` module with pure functions
- `parseManagedFile(content) → { blocks: ManagedBlock[], problems: MarkerProblem[] }`. It scans lines for `^\s*// cordy:(begin|end) (\S+)\s*$`. Each block records `slug`, `startLine`, `endLine | null`, and its own problems.
- `planManagedWrite(content | undefined, slug, update) → { kind: 'append' | 'replace', range? } | error`. This is the insert/update decision table. It runs twice: once before launch and once before writing.
- `applyManagedWrite(content, slug, blockBody, requiredImports) → string`. It merges the header, then appends or replaces.
- `mergeImports(content, required)`, described below.

`cordy tests` and the write path share `parseManagedFile`, so the listing always agrees with what writes accept.

*Alternative considered:* regex over `test('<name>'`. It was rejected because it can't find where a block ends, and it would conflict with hand-written tests that have the same title.

### Split `generateTypeScript` into a header and a body
Refactor internally into `generateTestBody(...)`, which returns the `test(...)` block lines, and `requiredImports(inputSource)`. The exported `generateTypeScript` keeps its signature and output for the legacy path (it composes header + body + trailing comment), plus an optional `testTitle` parameter that defaults to `'cordy automation'`. Managed mode wraps the body in markers and doesn't emit the trailing comment inside the block.

### Import merge is line-based over named imports
Required imports are modeled as `{ module, names[] }`. For each one:
1. If a single-line named import `import { ... } from '<module>';` exists, add any missing names to it.
2. Otherwise, insert a new import line after the last top-of-file import, or at the top if there are none.

Default and namespace imports are ignored. If the module is imported only in those forms, a separate named import line is added, which is valid TS.

*Alternative considered:* a full TS parser. It was rejected for this scope because the generated header is fully under Cordy's control.

### Validation placement
Flag combinations (`--test-name` format and dependencies, `--update` requires `--test-name`, `--diff` requires `--output` and excludes `--dry-run`) go in `cli-options.ts`, alongside the existing zod schema. The file-dependent preflight (read, parse, plan) runs in `runCordy` before `chromium.launch`. The same plan is recomputed right before writing so that concurrent edits during the run are caught.

### Write gate
The final step becomes:

```
if (!output) return
if (dryRun) → build structural preview (no body)       → result.diff
else if (managed && run not fully succeeded) → skip, note "unchanged"
else next = managed ? applyManagedWrite(...) : generateTypeScript(...)
     if (diffMode) → result.diff = unifiedDiff(current ?? '', next)
     else writeFile(next)
```

The dry-run preview needs no generated body. It is the import-merge diff plus a one-line description of the plan (`append` or `replace lines a–b`).

### Diff rendering
Use the `diff` npm package (`createTwoFilesPatch`), which is small, has no dependencies, and ships types. The diff text goes on the result object as `diff`. `app.ts` prints it to stdout when `--json` is off. Otherwise it is serialized in the JSON.

### `tests` subcommand
It is dispatched in `app.ts:main` next to `init`, as `args[0] === 'tests'`, and supports `--json`. The table output uses plain padded columns. The exit code is 1 if any problem exists.

## Risks / Trade-offs

- [A user deletes or edits a marker by hand] → Every write parses the whole file first and refuses on any problem, and `cordy tests` explains what is wrong and on which line.
- [Prettier or other tooling reorders imports or reformats the header] → The merge matches imports by module and name, not exact text. Formatting the file after generation stays safe.
- [Multi-line named imports, e.g. after prettier wraps a long import list] → Step 1 of the merge only matches single-line imports, so this case falls through to adding a separate import line from the same module. That is valid TS but less tidy. Acceptable, because generated imports are short and unlikely to wrap.
- [BREAKING dry-run change for users relying on dry-run to create a stub file] → Document it in the README. The stub was nearly empty, because dry-run never produces succeeded actions.
- [The file changes between preflight and write] → Re-run the plan right before writing, and fail without writing if it no longer holds.

## Migration Plan

No data migration. Existing generated files have no markers, so they are treated as "no managed blocks" and new blocks are appended. Rollback means reverting the release. Files with markers remain valid Playwright specs, because the markers are plain comments.
