## 1. Setup

- [x] 1.1 Add the `diff` package to `dependencies` and verify `npm ci` and `npm run typecheck` succeed

## 2. Managed output core (`src/managed-output.ts`)

- [x] 2.1 Implement `parseManagedFile` (blocks with slug/startLine/endLine, and problems for missing end, orphan end, nesting, slug mismatch, duplicate slug, and invalid slug). Verify with a new `test/managed-output.test.ts` that covers each problem kind and a valid two-block file
- [x] 2.2 Implement `planManagedWrite` for the append/replace/conflict table (missing file, file without markers, existing slug without update, missing slug with update, malformed file). Verify with unit tests for each cell
- [x] 2.3 Implement `mergeImports` (add missing names to single-line named imports, otherwise insert a new line after the last import). Verify with unit tests: no duplicates on a second block, `readFileSync` added once, and unrelated imports preserved
- [x] 2.4 Implement `applyManagedWrite` (merge header, then append or replace the marker-wrapped block). Verify with unit tests showing that other blocks and hand-written code stay byte-for-byte unchanged and that a replaced block keeps its position

## 3. Code generation

- [x] 3.1 Refactor `generateTypeScript` in `src/run.ts` into a body generator plus a required-imports helper, and add an optional test title (default `'cordy automation'`). Verify that existing `test/output.test.ts` and `test/generated-inputs.test.ts` pass unchanged
- [x] 3.2 Add a managed-block generator that wraps the body in `// cordy:begin <slug>` / `// cordy:end <slug>` with `test('<slug>', ...)`. Verify with a unit test of the exact block shape

## 4. CLI options

- [x] 4.1 Add `testName`, `update`, and `diff` to `ParsedOptions` and parse `--test-name`, `--update`, and `--diff` in `src/cli-options.ts`
- [x] 4.2 Validate slug format and length, `--test-name` requires `--output` and `--output-kind test`, `--update` requires `--test-name`, and `--diff` requires `--output` and excludes `--dry-run`. Verify with cases in `test/cli-options.test.ts`
- [x] 4.3 Update the help text in `src/app.ts` with the new flags and the `tests` subcommand, and verify `node dist/cli.js --help` shows them after build

## 5. Run integration

- [x] 5.1 In `runCordy`, run the file preflight (read, parse, plan) before `chromium.launch` when `--test-name` is set, and fail with the spec'd error messages. Verify with a test that a conflict throws before the browser is launched (inject or stub the launch)
- [x] 5.2 Replace the unconditional `writeFile` with the write gate: dry-run gives a structural preview and never writes; managed mode with failed or unfinished runs doesn't write; `--diff` sets `result.diff` instead of writing; otherwise write. Re-plan right before writing. Verify with unit tests of the gate logic, extracted as a pure function
- [x] 5.3 Add an optional `diff` field to the run result, print it to stdout in `app.ts` when not `--json`, and verify that `--json` output parses as a single JSON document containing `diff`

## 6. `tests` subcommand

- [x] 6.1 Add `cordy tests <file> [--json]` in `src/app.ts` using `parseManagedFile`. Print a table (slug, lines, status) or JSON, exit 1 on any problem or a missing file, and never launch a browser. Verify with tests for the valid, empty, malformed, and missing-file cases
- [x] 6.2 Export `parseManagedFile` (and its types) from `src/index.ts`, and verify the build emits them in `dist/index.d.ts`

## 7. Docs and verification

- [x] 7.1 Document `--test-name`, `--update`, `--diff`, `cordy tests`, and the BREAKING dry-run behavior in `README.md` and `docs/USAGE.md` (Spanish), and verify the examples match the implemented flags
- [x] 7.2 Run `npm run format:check`, `npm run typecheck`, `npm test`, and `npm run build`, and verify all pass
- [ ] 7.3 Manual check against `fixture/index.html`: create two blocks in one file, update one with `--diff`, then with `--update`, and confirm with `cordy tests` that both blocks remain valid
