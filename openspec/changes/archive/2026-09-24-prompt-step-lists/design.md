## Context

A run has two sources of steps today. `--plan` loads a `LoadedPlan` (`plan-file.ts`), Jev classifies its natural-language steps (`JevClient.classifySteps`), and `stepsFromPlanFile` turns them into `PlanStep[]`. Without `--plan`, `workflow-plan.ts:createWorkflowPlan` matches Spanish regexes and `stepsFromWorkflowPlan` converts the result. `run.ts` branches on `planFile` in several places:
- the stop-after-high-impact rule;
- the `--max-steps` error;
- the incomplete-step and unused-input checks;
- value warnings;
- the `plan` result field.

`expectations.ts:inferExpectations` is the last regex reader of the prompt.

## Goals / Non-Goals

**Goals:**
- One execution path: every run is a list of `PlanStep` built from a `LoadedPlan`.
- Deterministic, local, language-independent splitting that users can preview offline.
- Remove every regex that reads meaning from the prompt.

**Non-Goals:**
- Splitting on conjunctions (`y`, `and`, `luego`) or inline dashes.
- Letting Jev split the prompt. Jev keeps classifying only and still rejects `compound` steps.
- Explicit step forms (`submit: X`, `fill: [keys]`) inside a prompt. Those need a plan file.
- Stripping a leading conjunction left after an Oxford comma (`…, y envía`). Jev classifies the step anyway.

## Decisions

**Splitter output is a `LoadedPlan`.** A new `src/prompt-steps.ts` exports `planFromPrompt(text): LoadedPlan`, with only `natural` steps and no `description`. `run.ts` then does `const planFile = options.plan ? await loadPlanFile(options.plan) : planFromPrompt(loadPrompt(options))`. Every `planFile ? … : …` branch collapses, and classification, anchoring, cursor, reporting, and warnings are reused unchanged. *Alternative:* a third `PlanStep` source. Rejected, because it would keep a separate prompt mode.

**The task sent to Jev is the prompt text.** It is the same information as the joined steps, and it keeps the user's own phrasing as context. For plan files nothing changes: the task is the `description` or the joined step texts.

**Character scanner for commas.** A small loop tracks whether it is inside `"…"` or `“…”` and splits on `,`/`;` only outside quotes, unless the comma sits between two digits. These are the same quote characters that `anchoredIn` recognizes for exact targets, so a quoted name is protected both from splitting and in anchoring. Single quotes are not tracked, because apostrophes (`don't`, `l'app`) would leave the scanner stuck inside a quote.

**Semicolons split like commas.** They are unambiguous and cost nothing.

**Inline numbering must start at 1 and continue in sequence.** This avoids splitting `espera 3. …`, or a control name containing `2.`. It applies only when the whole prompt is one line; multi-line prompts use per-line markers.

**Limits reuse the plan constants.** `PLAN_MAX_STEPS` and `PLAN_MAX_STEP_LENGTH` apply, with the same wording as plan-file errors but located as `prompt step N`.

**`plan from-prompt` prints YAML with `yaml.stringify({version: 1, steps})`.** It makes the split visible, and it converts a prompt into a plan file that can then use explicit forms.

**Removals.**
- `src/workflow-plan.ts`, `src/expectations.ts`, `stepsFromWorkflowPlan`, and their tests are removed.
- The `inferred` input to `collectExpectations` is removed.
- The `plan` result field is removed, and `planSteps` is always present.
- In `run.ts`, the `!planFile` stop rule and the `--max-steps` prompt error are removed. The plan checks for incomplete steps and unused inputs cover both cases.

**The CLAUDE.md language exception goes away.** Since nothing parses Spanish, test fixtures and example prompts can be in English. A few Spanish prompts stay in tests on purpose, to show that the language does not matter.

## Risks / Trade-offs

- **Commas inside a step split it**, for example `llena monto, plazo y tasa`. *Mitigation:* fill steps do not need key names (`llena el formulario`). Docs recommend quotes or line breaks, and `plan from-prompt` shows the split before a run.
- **Breaking change for existing prompts.** `…, llena el formulario y simula` is now rejected as compound before the browser opens, with a message asking to split the step. The README and USAGE examples are rewritten as lists. The version is still 0.x and has no published release (0.2.0 is not yet on npm), so the break costs little now.
- **Every prompt run makes one extra Jev call** for classification. This is already the case for plan files, and it is one request per run.
- **Single-instruction prompts** such as `Go to Pricing and click Buy` become one compound step and are rejected. *Mitigation:* the compound error message suggests separating the actions with commas or line breaks.
