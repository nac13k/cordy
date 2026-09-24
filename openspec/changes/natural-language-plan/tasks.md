## 1. Jev contract

- [x] 1.1 Confirm with the Jev service that a classification request with per-step `choice` questions and no page observation is accepted. Record the confirmed request shape (or the fallback of sending it after the first observation) in design.md, and verify with a recorded request/response example used as a test fixture

## 2. Plan file

- [x] 2.1 Implement the plan schema and YAML/JSON loader in `src/plan-file.ts` (version, description, step forms, limits of 50 steps and 300 characters) with `steps[i].field: message` errors. Verify with a new `test/plan-file.test.ts` covering each accepted form and each rejection in the spec
- [x] 2.2 Add `--plan <path|->` to `src/cli-options.ts`, mutually exclusive with the positional instruction and `--prompt-file`, and derive the Jev task from the description or step texts. Verify with `test/cli-options.test.ts`
- [x] 2.3 Add `cordy plan init`, `plan schema` (via `z.toJSONSchema`), and `plan check` to `src/app.ts` with help text. Verify with `test/app.test.ts`: init refuses overwrite, the schema accepts the init template, and check runs without a Jev key

## 3. Step model and cursor

- [x] 3.1 Introduce the `PlanStep` model and adapt `createWorkflowPlan` to emit it, with a clear "no plan could be derived; use --plan" error when empty. Verify that the existing `test/workflow-plan.test.ts` still passes and add the English-prompt error case
- [x] 3.2 Replace the counting heuristic in `currentWorkflowStep` with an explicit cursor and per-kind completion rules (click, submit, explicit fill, natural-language fill with `none`, local wait). Verify with unit tests for each rule, including the two-screen wizard scenario, using a fake Jev fetcher and fixture pages
- [x] 3.3 Add the end-of-plan unconsumed-input check (values and files). Verify with a test naming the unused key and asserting no managed output is written

## 4. Jev integration

- [x] 4.1 Implement the classification request and response handling (abort on `compound`, missing, or invalid answers, naming the step). Verify with `test/jev.test.ts` fake-fetcher cases for each outcome
- [x] 4.2 Send the current step's text and pending keys in the workflow context, and implement anchoring (quoted exact, free whole-word, explicit keeps `matchesTarget`) with Unicode normalization. Disable prompt-specific corrections in plan mode. Verify with `test/jev.test.ts` cases for the three anchoring scenarios in the spec and a non-Latin name

## 5. Run loop

- [x] 5.1 Apply the high-impact union and `--approve` requirement, and continue after high-impact clicks in plan mode only. Verify with run tests: a click on `Enviar` requires approval, and a step after a submit is executed
- [x] 5.2 Record local `wait` steps with `state: 'load'` and emit `waitForLoadState('load')` in codegen. Verify with `test/output.test.ts`
- [x] 5.3 Add plan step interpretation (text, kind, target or keys, duration-ignored note) to the result and the value warnings (e-mail, four or more digits). Verify with a dry-run output test

## 6. Docs and checks

- [x] 6.1 Document plan files, step forms, anchoring, completion rules, subcommands, and warnings in `README.md` and `docs/USAGE.md`. Update the invariants in `CLAUDE.md` (Jev classifies plan steps; plan mode continues after high-impact clicks). Run `npm run format:check`, `npm run typecheck`, `npm test`, and `npm run build`, all passing
