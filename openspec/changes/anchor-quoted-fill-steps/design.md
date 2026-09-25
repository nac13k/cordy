## Context

`JevClient.nextAction` (`src/jev.ts`) already anchors natural-language click targets with `anchoredIn(name, text, anchor)`. For a natural-language fill step it only turns a "no input key" answer into `step_complete`. Before its validations it may also correct Jev's field choice locally: when Jev picks a filled or non-text element for a fill, it looks for a single textbox whose name matches the input key. `run.ts` keeps the step cursor (`Cursor.consumedInStep`) and turns `step_complete` into `needs_review` when nothing was consumed in the step. `nextAction` only receives run-wide `consumedInputKeys`, not the keys consumed in the current step. Requirements are in `specs/plan-step-execution/spec.md`.

## Goals / Non-Goals

**Goals:**
- Quoted fill steps act only on the fields they name, and end cleanly when Jev moves on to another field.
- Reuse the existing anchoring rule so clicks and fills normalize names the same way.

**Non-Goals:**
- Anchoring unquoted fill steps (`llena el formulario` must still fill the whole screen).
- Restricting which input keys Jev is offered, or matching input keys to field names.
- Changing classification, the Jev payload, or generated code.

## Decisions

**Anchor after the local field correction.** The check runs on the final `element` that `nextAction` would act on, right after the existing click anchoring block. Checking Jev's raw choice would reject a case the correction fixes, and checking before it would let the correction move the fill onto an unnamed field.

**Scope: `fill`, `select`, `check`, and `upload`.** These are the actions a fill step allows (`upload` is derived from `fill` with a file key). A file control's accessible name is its label, so the same rule applies.

**Per-step consumed keys come from the caller.** Add `consumedInStep?: string[]` to the `step` context of `nextAction`, and `run.ts` passes `cursor.consumedInStep`. Then `nextAction` decides the outcome:
- not anchored and `consumedInStep.length > 0` → `step_complete` with the reason `Field "<name>" is not named in the step; ending the step`;
- not anchored and nothing consumed → `needs_review` with the reason `Field "<name>" is not named in the step "<text>"`.
Alternative considered: always return `step_complete` and let `run.ts` convert it. That would replace the precise reason with the generic `found no field for any pending input`, which is what made this failure hard to read.

**`step_complete` keeps its current cursor semantics.** `advanceCursor` already moves to the next step on `no_input_key` when the step consumed something, so no cursor change is needed.

**Quoted detection reuses `PlanStep.anchor`.** Natural-language steps already get `anchor: 'quoted'` when their text contains quotes. The fill check applies when `step.kind === 'fill' && step.text && !step.keys && step.anchor === 'quoted'`. The comment on `PlanStep.anchor` changes to say it covers fill steps too.

## Risks / Trade-offs

- [A quoted fill step names a label that differs from the accessible name, such as `llena "Correo"` for a field named `Correo electrónico`] → Quoted matching is exact by spec, as it is for clicks. The run stops with a `needs_review` that names the field, so the fix is to quote the full name or drop the quotes. README gains one sentence on this.
- [Prompts that relied on a quoted step filling other fields] → Called out as a behavior change in the proposal. The fix is an unquoted `llena el formulario` step or one step per field.
- [Jev spends an extra round-trip per quoted step, because one answer is used only to detect the step's end] → Acceptable. The same happens today when unquoted fill steps end with "no input key".
