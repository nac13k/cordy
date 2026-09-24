## Why

A prompt-derived run keeps asking Jev for actions after its derived steps are complete, with no step constraints at all. Jev is told to "choose the next safe click needed to complete the flow", so it can click any control. An English prompt such as "Go to the shipping quote section, fill in the form, and click Simulate" only yields a fill step, so everything after the fill is unconstrained. The same click also skips approval: the high-impact name rule only knows Spanish verbs plus `submit`, so a button named `Simulate` is clicked without `--approve`. Both break the rule that Jev only acts inside Cordy's plan and that irreversible clicks need approval.

## What Changes

- **BREAKING:** a prompt run ends as soon as its derived steps are complete. Cordy then checks the expectations; it never asks Jev for another action outside the plan. A prompt that only derives a fill step (for example `llena el formulario`) no longer makes an extra click. Flows that need more steps use `--plan`, or the Spanish verbs the planner recognizes (`simula`, `calcula`).
- A prompt run that reaches `--max-steps` before completing its derived steps fails with an error naming the first incomplete step, as plan runs already do. Before, it could end with exit code 0.
- The high-impact name rule also recognizes English submission verbs: `simulate`, `calculate`, `send`, `confirm`, `continue`, `request`, `apply`, `pay`, `purchase`, `buy`, `order`, `delete`, `remove` (plus the existing `submit` and Spanish verbs). Clicks on those controls require `--approve` in every mode.
- The unconstrained instruction Cordy sent to Jev after all inputs were filled is removed from the run loop.

## Capabilities

### New Capabilities
- `prompt-run-safety`: When a prompt-derived run ends, how an incomplete prompt run is reported, and which control names make a click high impact.

### Modified Capabilities
<!-- None: the related behavior has no main spec under openspec/specs/ yet. -->

## Impact

- **Code:** `src/run.ts` (stop when the cursor passes the last prompt-derived step; report incomplete steps in prompt mode), `src/jev.ts` (extend the high-impact name rule; drop the "all inputs filled, choose a click" instruction path used only by the unconstrained loop).
- **Tests:** new run-level tests for a fill-only prompt that stops after filling, an incomplete prompt run at the step limit, and English high-impact names; existing tests that relied on the unconstrained tail are updated.
- **Docs:** `README.md` (prompt run behavior, high-impact names), `CLAUDE.md` (loop exit rule).
- **Users:** runs that relied on Jev picking a final click after the derived steps must use `--plan` or a recognized Spanish verb. Clicks on controls named like `Continue`, `Send`, or `Order` now need `--approve`.
