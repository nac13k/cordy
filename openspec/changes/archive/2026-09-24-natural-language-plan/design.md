## Context

`createWorkflowPlan` builds a `WorkflowPlan` from Spanish regexes. `currentWorkflowStep` infers the current step by counting succeeded clicks and fills rather than tracking a cursor. `jev.ts` contains prompt-specific corrections (for example `/simula|secci[oó]n|entrando/` on `state.task`, and a hard-coded `data-event` selector) and a `matchesTarget(name, target)` rule that needs a target string. The run loop stops right after the first high-impact click.

## Goals / Non-Goals

**Goals:**
- A plan contract any author (human or LLM) can write, in any language and for any domain.
- Keep Cordy, not Jev, in charge of step order, completion, and target validation.

**Non-Goals:**
- An embedded local LLM planner. The JSON Schema lets any external LLM produce plans.
- Intermediate assertions inside the plan (expectations stay CLI-only).
- Splitting compound steps automatically, and fixed-duration waits.
- Caching classifications between runs.

## Decisions

### Plan file → internal step model
```
PlanFile (zod, YAML via `yaml`)
  steps[i]: string | {click} | {submit} | {fill} | {wait}
        │  classify natural-language steps with Jev (once, before the first page action)
        ▼
PlanStep { index, text?, kind: click|submit|fill|wait, anchor: quoted|free|explicit, target?, keys? }
```
The regex planner is adapted to emit the same `PlanStep[]`, so the run loop has a single execution path. Its steps are all explicit (`navigate_section` and `click` → click with a target, `fill_inputs` → explicit fill, final click → submit). The `assert` step leaves the step list and is handled by the expectations phase.

### Classification: one request, one `choice` question per step
The classification request reuses the Jev endpoint with a minimal state (`task` = description, no page data) and a question per step, `step_<i>`, with the options `click`, `fill`, `wait`, `submit`, and `compound`, plus criteria text for each. One request keeps latency flat. **Confirmed (task 1.1, 2026-09-24):** a probe with six synthetic steps and no page observation (`state: { task, plan: { steps: [{ index, text }] } }`, one `choice` question `step_<i>` per step with criteria for `click`, `fill`, `wait`, `submit`, `compound`) returned HTTP 200 from `jev-1.13.0`. Every step was classified as expected, including `compound` for a two-action step and `click` for an English step. Each answer also carries `confidence` and `probabilities`. The response is recorded in `test/fixtures/jev-classification.json` (answers only, no credentials). Classification therefore runs before the browser launches.

### Explicit step cursor
`run.ts` keeps `{ stepIndex, consumedInStep: Set<string> }` and advances it after each succeeded record according to the completion rules. This replaces the counting heuristic in `currentWorkflowStep` for both plan and regex modes. `workflowContext` gains `instruction` (the step text) and the pending keys, so Jev sees the natural-language step next to the page state.

### Anchoring
`normalizeForAnchor(s)` = NFD, strip `\p{M}`, lowercase, replace `[^\p{L}\p{N}]+` with a space, and trim. Unicode-aware classes keep non-Latin scripts working. A whole-word check is ` ${step} `.includes(` ${name} `). Quoted text is extracted with `"([^"]+)"|“([^”]+)”`. With several quoted segments, the element must equal one of them. The prompt-specific corrections in `jev.ts` are disabled in plan mode because they read `state.task`, which is now user-authored and in any language.

### Natural-language fill completion via `input_key: none`
Jev already answers an `input_key` question with a `none` option. In a natural-language fill step, `none` (or action `wait`) after at least one consumption completes the step. Jev can therefore end a screen's fill early. The end-of-plan "all inputs consumed" check makes that safe: a skipped key fails the run instead of passing silently.

### High impact, approval, and continuation
`highImpact = step.kind === 'submit' || HIGH_IMPACT_NAME.test(element.name)`. **Decision (during implementation):** `--approve` is enforced in both plan and regex modes. Until now `run.ts` passed `approve = true` unconditionally and the README described `--approve` as a compatibility no-op. Without `--approve`, a high-impact click is now recorded as `blocked` with `requires --approve`, and nothing is clicked. The loop-exit rule changes only in plan mode: continue until the cursor passes the last step. Regex mode keeps stopping after the first high-impact click.

### Wait steps are local
A `wait` step executes `page.waitForLoadState('load')` directly and records a `wait` action with `state: 'load'`, so codegen emits `waitForLoadState('load')`. The existing Jev-proposed `wait` keeps `domcontentloaded`.

### Subcommands
`plan schema` uses zod 4's `z.toJSONSchema` on the plan schema, so it cannot drift from the validator. `plan init` writes a template with comments explaining each step form, the anchoring rule, and that values go in `--input`/`--file`. `plan check` runs only the zod validation and prints errors in the same `steps[i].field: message` format.

## Risks / Trade-offs

- [Jev's classification can vary between runs] → The dry-run shows the interpretation, and any author who needs determinism can use explicit step forms. Caching is left for later.
- [Free anchoring can accept a short, generic name that happens to appear in the step (for example "Si")] → The minimum length is two characters and the match must be a whole word. Quotes give authors a strict mode, and a wrong click is still caught by expectations.
- [Jev's `none` can end a fill step too early on a screen that had a pending field] → The end-of-plan consumption check fails the run, naming the key.
- [Continuing after a high-impact click changes a documented invariant] → Only in plan mode, where the author explicitly listed the later steps. `--approve` is still required, and `CLAUDE.md` is updated.
- [Enforcing `--approve` in regex mode breaks existing commands that relied on the implicit approval] → Called out as **BREAKING** in the proposal and README. The fix for users is to add `--approve`.
- [Classification request shape is unconfirmed with Jev] → Task 1.1 runs before any other implementation. The fallback keeps the specs intact.

## Migration Plan

This change is additive. Without `--plan`, behavior is unchanged except that an empty regex plan now gives a clear error. The cursor refactor also runs in regex mode, and the existing `test/workflow-plan.test.ts` and run tests guard it.
