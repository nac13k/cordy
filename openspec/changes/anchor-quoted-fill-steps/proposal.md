## Why

A prompt with one fill step per field, such as `Llena "Nombre completo", llena "Correo electrónico", da click en "Crear cuenta"`, fails against `fixture/index.html`. A natural-language fill step is offered every unused input and its chosen field is never checked against the step text. So step 1 fills both "Nombre completo" and "Correo electrónico", and step 2 finds nothing left and ends in `needs_review` (`found no field for any pending input`). The Cordy agent skill recommends putting exact control names in double quotes, so agents will write exactly this kind of prompt.

## What Changes

- A natural-language `fill` step whose text contains quoted text is anchored like a click step: Cordy accepts a fill, select, check, or upload only on an element whose normalized accessible name equals one of the quoted texts in the step.
- When Jev chooses an element that the quoted fill step does not name:
  - if the step already consumed at least one input, the step completes and the cursor moves to the next step;
  - otherwise Cordy returns `needs_review` with the reason `Field "<name>" is not named in the step "<text>"`.
- Unquoted natural-language fill steps (for example `llena el formulario`) and explicit `fill: [keys]` steps keep their current behavior.
- **BREAKING (behavior)**: a quoted fill step no longer fills fields it does not name. A prompt that relied on `llena "Nombre"` also filling other fields must add steps for them or use an unquoted step such as `llena el formulario`.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `plan-step-execution`: "Target anchoring for natural-language steps" extends anchoring to quoted `fill` steps, and "Step completion rules" adds how a quoted fill step completes when Jev chooses an unnamed field.

## Impact

- `src/jev.ts:nextAction`: anchor check for quoted natural-language fill steps, using the existing `anchoredIn`, and a per-step consumed count in its context.
- `src/run.ts`: passes the keys consumed in the current step to `nextAction`.
- Tests in `test/jev.test.ts` and `test/run-plan.test.ts`, including a replay of the fixture failure with a fake fetcher.
- README section on prompts gains one sentence about quoted fill steps. No CLI, config, or Jev payload changes.
