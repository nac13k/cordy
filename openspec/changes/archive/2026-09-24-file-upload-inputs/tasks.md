## 1. Inputs

- [x] 1.1 Add the repeatable `--file key=path[,path]` flag to `src/cli-options.ts` (key validation, at least one path). Verify with `test/cli-options.test.ts` cases for one path, several paths, and an empty path list
- [x] 1.2 Extend `loadInputs` in `src/inputs.ts` to return values and files, accept typed `{type:'file', path|paths}` JSON entries, reject other object shapes, reject key collisions, and check every path exists and is a readable regular file relative to cwd. Verify with unit tests using temp files for each accepted and rejected case
- [x] 1.3 Make `resolveInputRecord` skip typed file entries. Verify with `test/dynamic-inputs.test.ts`

## 2. Domain and observation

- [x] 2.1 Add `upload` to `PlannedAction`, and `file` role plus optional `accept`/`multiple` to `InteractiveElement` in `src/domain.ts`. Verify with `npm run typecheck`
- [x] 2.2 Update `observePage` to include hidden `input[type=file]` elements with role `file`, `accept`, `multiple`, the name fallback chain, and `valueState` from `files.length`. Verify with `test/observe.test.ts` using a fixture page that has a hidden file input behind a label button

## 3. Jev and validation

- [x] 3.1 Send `type: 'file'` for file keys in the Jev request, never paths or names, and show `key (file)` in verbose traces. Verify with a `test/jev.test.ts` fake-fetcher case asserting the payload contains neither the file name nor the directory
- [x] 3.2 Map `fill` + file key + `file` element to `upload`, and return `needs_review` for file key on a non-file element, value key on a file element, accept mismatch, and several files on a single-file input. Exclude file keys and file elements from the text-field re-matching heuristic. Verify with one `test/jev.test.ts` case per rule
- [x] 3.3 Implement the accept matcher (extensions, exact MIME, `type/*`, built-in extension→MIME table). Verify with unit tests

## 4. Execution and codegen

- [x] 4.1 Execute `upload` with `setInputFiles(paths)` in `execute`, recording `planned` in dry-run, and count it as consuming its key. Verify with a browser test against a fixture page that shows the selected file name after upload
- [x] 4.2 Emit a `files` constant and `setInputFiles(files[key])` lines in test and automation output. Verify with `test/output.test.ts` snapshots for inline inputs and for an inputs JSON file with a typed entry

## 5. Docs and checks

- [x] 5.1 Document `--file`, typed JSON entries, cwd-relative paths, the privacy guarantees, and the out-of-scope patterns in `README.md` and `docs/USAGE.md`. Run `npm run format:check`, `npm run typecheck`, `npm test`, and `npm run build`, all passing
