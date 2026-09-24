## 1. Input parsing

- [x] 1.1 Change `--input` parsing in `src/cli-options.ts` so a valid key before the first `=` always yields an inline input, and only other arguments become `inputFile`. Verify with new `test/cli-options.test.ts` cases for `report=./data/report.json`, `./inputs.json`, `/abs/inputs.json`, and `query=a=b`

## 2. Action execution parity

- [x] 2.1 Add a shared boolean parser (`true`/`false`, case-insensitive, trimmed; anything else throws with the key and accepted values) and use it in `execute` for `check`. Verify with a unit test for `TRUE`, `false`, and `yes`
- [x] 2.2 Make `select` and `check` fail with `missing input: <key>` when the key is absent, matching `fill`. Verify with a unit test on the action record
- [x] 2.3 Change the generated `check` line in `actionLines` to apply the same boolean interpretation instead of `Boolean(...)`. Verify with a `test/output.test.ts` case asserting the emitted expression and that `"false"` evaluates to unchecked

## 3. Consumption tracking

- [x] 3.1 Update `currentWorkflowStep` in `src/run.ts` to treat succeeded `fill`, `select`, and `check` actions as consuming their input key. Verify with a `test/workflow-plan.test.ts` (or run-level) case where a `select` completes the `fill_inputs` step
- [x] 3.2 Compute the consumed-key set from the full action history and pass it to `JevClient.nextAction` (instead of deriving it from the last five `recentActions`), counting all three action kinds. Verify with a `test/jev.test.ts` case using a fake fetcher and seven consumed inputs, asserting `allInputsFilled` is true in the request payload

## 4. Wrap-up

- [x] 4.1 Update `README.md` (`--input` parsing rules and boolean values for checkboxes) and run `npm run format:check`, `npm run typecheck`, `npm test`, and `npm run build`, all passing
