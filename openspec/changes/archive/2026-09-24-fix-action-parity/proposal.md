## Why

Several input-handling paths behave differently depending on which action consumed the input or where the code runs. A generated spec can check a checkbox that the live run left unchecked, a workflow step can stall because an input was set with `select` instead of `fill`, and `--input key=./file.json` is misread as an inputs file. File uploads and plan files (later changes) build on this input tracking, so it has to be correct first.

## What Changes

- Boolean inputs used by `check` are interpreted the same way in the live run and in generated code. Only `true`/`false` (case-insensitive) are accepted. Any other value fails the action with a clear error instead of silently meaning "unchecked".
- An input counts as consumed when any succeeded action used its key (`fill`, `select`, or `check`), not only `fill`. This applies to the `fill_inputs` step progress and to the "all inputs filled" signal sent to Jev.
- The "all inputs filled" signal is derived from the full action history, not from the last five recent actions.
- `select` and `check` with a missing input key fail with `missing input: <key>`, like `fill` already does.
- `--input` treats an argument as `key=value` whenever the text before the first `=` is a valid input key, even if the value ends in `.json` or starts with `./` or `/`. Only arguments without such a prefix are treated as an inputs file path.

## Capabilities

### New Capabilities
- `form-input-actions`: How input-consuming actions (`fill`, `select`, `check`) resolve values, when an input counts as consumed, and parity between the live run and generated code.
- `cli-input-parsing`: How the `--input` flag distinguishes inline `key=value` pairs from an inputs file path.

### Modified Capabilities
<!-- None: no baseline specs exist yet under openspec/specs/. -->

## Impact

- **Code**: `src/run.ts` (`execute`, `actionLines`, `currentWorkflowStep`), `src/jev.ts` (consumed-input tracking and the `allInputsFilled` signal), `src/cli-options.ts` (`--input` parsing).
- **Behavior**: a `check` input such as `"yes"` or `"1"` now fails instead of unchecking. This is a correctness fix, but existing prompts that relied on it will see a failure.
- **Tests**: new vitest coverage in `test/cli-options.test.ts`, `test/output.test.ts`, `test/workflow-plan.test.ts`, and `test/jev.test.ts`. No real Jev calls.
- **Prerequisite for**: `file-upload-inputs` and `natural-language-plan`, which rely on per-key consumption tracking.
