## 0. Prerequisite

- [x] 0.1 Archive `neutralize-client-phrases`, `constrain-prompt-runs`, `natural-language-plan`, and `declarative-expectations` (syncing their specs), and verify that `openspec/specs/` contains `prompt-planning`, `prompt-run-safety`, `workflow-plan-file`, `plan-step-execution`, and `result-expectations`

## 1. Prompt splitter

- [x] 1.1 Add `src/prompt-steps.ts` with `splitPromptSteps(text)` (line markers, sequential inline numbering, comma/semicolon split outside `"…"`/`“…”`, decimal comma, trim and trailing period), verified by `test/prompt-steps.test.ts` covering every scenario of the "Prompt splitting" requirement
- [x] 1.2 Add `planFromPrompt(text): LoadedPlan` enforcing `PLAN_MAX_STEPS`, `PLAN_MAX_STEP_LENGTH`, and the empty-prompt error, verified by tests for 51 steps, a 301-character step, and `, ;`

## 2. Single execution path

- [x] 2.1 In `src/run.ts`, build the plan with `planFromPrompt(loadPrompt(options))` when `--plan` is absent, send the prompt text as the Jev task, and collapse every `planFile ? … : …` branch, verified by `test/run-plan.test.ts` cases for a prompt list (English list, continue after submit, unused input, compound rejection)
- [x] 2.2 Remove the prompt-only stop-after-high-impact rule and the `--max-steps` prompt error, verified by a test showing a prompt run continuing after an approved submit
- [x] 2.3 Remove the `plan` result field, always report `planSteps`, and apply `planValueWarnings` to prompt steps, verified by a `--dry-run --json` test and an e-mail warning test
- [x] 2.4 Make the `compound` error suggest separating actions with commas or line breaks, verified by a `classifySteps` test

## 3. Remove regex readers

- [x] 3.1 Delete `src/workflow-plan.ts`, `stepsFromWorkflowPlan`, and their tests, and verify that `npm run typecheck` passes
- [x] 3.2 Delete `src/expectations.ts`, drop the `inferred` input from `collectExpectations`, and update the expectation tests, verified by a test that a `botón de …` prompt yields no expectations
- [x] 3.3 Update `src/index.ts` exports (remove the planner, export `planFromPrompt`), verified by `npm run build`

## 4. CLI

- [x] 4.1 Add `cordy plan from-prompt <text|->` in `src/app.ts`, printing YAML without contacting Jev, and verify with a test that its output passes `parsePlanFile` and that it fails with exit code 1 on a limit
- [x] 4.2 Update `--help` text for the prompt and the `plan` subcommands, and verify with `node dist/cli.js --help`

## 5. Docs and checks

- [x] 5.1 Rewrite the README intro and examples as step lists, replace the "prompt runs end" section, and document the splitting rules and `plan from-prompt`; verify that `grep -n "createWorkflowPlan\|Spanish phrasing" README.md docs/USAGE.md` finds nothing
- [x] 5.2 Update `docs/USAGE.md` and `CLAUDE.md` (architecture steps 3–5, invariants, and the removed language exception), verified by review against the new behavior
- [x] 5.3 Run `npm run format:check`, `npm run typecheck`, `npm test`, and `npm run build`, and verify that all pass
