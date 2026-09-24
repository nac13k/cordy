## Context

See proposal.md for the motivation. In `run.ts`, the step loop breaks on `!planStep && planFile`, so in prompt mode it keeps going after the cursor passes the last derived step. `workflowContext(undefined)` then returns no workflow, and `JevClient.nextAction` sends the instruction "All provided inputs are already filled. Choose the next safe click needed to complete the requested test flow". The loop only stops on a non-succeeded record, a high-impact click, or `--max-steps`. The high-impact test is one regex in `jev.ts` (`/submit|enviar|simular|continuar|confirmar|calcular|solicitar/i` on the element name), combined in `run.ts` with the `submit` step kind.

## Goals / Non-Goals

**Goals:**
- Jev never acts outside a derived or declared step.
- Submission-like clicks need approval whether the control is labeled in Spanish or English.
- An incomplete prompt run is visible in the result and the exit code.

**Non-Goals:**
- Teaching the prompt planner English phrasing. Plan files are the multi-language path.
- A configurable high-impact word list. It can come later if a project needs its own verbs.
- Changing what the planner derives from a prompt.

## Decisions

### One loop exit rule for both modes
The loop breaks when `steps[cursor.index]` is undefined, in both modes. The prompt-mode break "right after a high-impact click" becomes redundant, because the final click is the last derived step, but it stays as a guard. The end-of-run check that already exists for plan mode (first incomplete step) runs in prompt mode too. The "unused inputs" check stays plan-only, because a prompt's fill step always lists every input.

Alternative considered: allow one extra Jev click after the derived steps, always treated as high impact. Rejected by the owner in favor of a strict stop. It would still let Jev pick an arbitrary control.

### The unconstrained instruction becomes dead code in the loop
With the new exit rule, `nextAction` is never called without a workflow from `runCordy`. The `allInputsFilled` branch of the instruction text is removed. The generic instruction (no workflow) stays for programmatic callers of `JevClient`, and it does not invite a click.

### Word list, not a translation layer
The rule stays a single case-insensitive substring regex over the control name, extended with English verbs. Substring matching means `Send request`, `Continue to payment`, and `Place order` all match. False positives (for example a `Continue reading` link) only add an approval requirement, which errs on the safe side. The list is exported as a constant so tests and docs can reference it.

## Risks / Trade-offs

- [Prompts that relied on Jev finishing the flow now stop early] → Called out as BREAKING, with `--plan` and the recognized Spanish verbs as the migration path. The run still passes or fails on its expectations.
- [Broader English verbs make more clicks require `--approve`] → That is the intended direction. Runs that click such controls must pass `--approve`, as documented.
- [`order`/`apply` can match navigation labels such as `Order history`] → Acceptable: the only effect is requiring `--approve` for that click.
