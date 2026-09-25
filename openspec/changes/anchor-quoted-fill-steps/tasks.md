## 1. Anchoring in Jev validation

- [x] 1.1 Add `consumedInStep?: string[]` to the `step` context of `JevClient.nextAction` and update the `PlanStep.anchor` comment to cover fill steps; verify `npm run typecheck` passes
- [x] 1.2 In `nextAction`, after the local field correction and the click anchoring block, reject fill/select/check/upload on an element not anchored in a quoted natural-language fill step: `step_complete` when `consumedInStep` is non-empty, otherwise `needs_review` with `Field "<name>" is not named in the step "<text>"`; verify new `test/jev.test.ts` cases for accepted anchor (diacritics differ), several quotes, unnamed field with and without consumed keys, and an unquoted fill step that stays unanchored
- [x] 1.3 Verify the existing Jev tests (click anchoring, natural fill `step_complete`, explicit fill) still pass unchanged

## 2. Run loop

- [x] 2.1 Pass `cursor.consumedInStep` as `step.consumedInStep` from `run.ts` to `nextAction`; verify with a `test/run-plan.test.ts` replay of the fixture failure (steps `Llena "Nombre completo"`, `llena "Correo electrónico"`, `da click en "Crear cuenta"`, where the fake Jev picks the email field while step 1 is current): all three steps done, fills attributed to steps 1 and 2, click succeeded, exit without `errors`
- [x] 2.2 Add a run test where the first answer of a quoted fill step picks an unnamed field and verify the run stops with the `Field "…" is not named in the step` reason and nothing is filled

## 3. Docs and checks

- [x] 3.1 Add one sentence to README "Prompts are step lists" and to `docs/USAGE.md` (plan files paragraph): a fill step with quoted names only fills the fields it names, quoted names must match exactly, and an unquoted step such as `fill in the form` fills every visible field; verify the wording matches the spec
- [x] 3.2 Run `npm run format:check`, `npm run typecheck`, `npm test`, `npm run build`; then rerun the fixture flow with `node --env-file=.env dist/cli.js 'Llena "Nombre completo", llena "Correo electrónico", da click en "Crear cuenta"' --start-url "file://$PWD/fixture/index.html" ... --json` and verify every action is `succeeded` and there are no `errors`
