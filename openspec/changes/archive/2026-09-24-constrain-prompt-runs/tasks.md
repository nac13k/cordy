## 1. Run loop

- [x] 1.1 Break the step loop in `src/run.ts` when the cursor has passed the last step in both modes, keeping the prompt-mode break after a high-impact click as a guard. Verify with a run test where `llena el formulario` with one input records only the fill and makes a single Jev request
- [x] 1.2 Report the first incomplete step as an error in prompt mode (not in dry runs), so the exit code is 1 and managed output is not written. Verify with a run test using `--max-steps 1` on a prompt with a fill and a final click
- [x] 1.3 Remove the "all inputs filled, choose the next click" instruction branch from `JevClient.nextAction`. Verify with `test/jev.test.ts` that a request without a workflow no longer contains that text

## 2. High-impact rule

- [x] 2.1 Export the high-impact word list from `src/jev.ts` and extend it with the English verbs from the spec, matching case-insensitively on the control name. Verify with unit tests for `Simulate`, `PLACE ORDER`, `Send request`, and a non-matching name
- [x] 2.2 Verify with a run test that a plan step clicking a button named `Simulate` is blocked without `--approve`

## 3. Regression and docs

- [x] 3.1 Add a run test for the English prompt from the spec with one input: only the fill runs and `Simulate` is never clicked. Update existing tests that relied on the unconstrained tail
- [x] 3.2 Document the new prompt-run end rule, the incomplete-run error, and the high-impact word list in `README.md`, and update the loop exit rule in `CLAUDE.md`. Run `npm run format:check`, `npm run typecheck`, `npm test`, and `npm run build`, all passing
