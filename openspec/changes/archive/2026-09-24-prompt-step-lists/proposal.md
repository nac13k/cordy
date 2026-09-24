## Why

The prompt planner only understands four Spanish phrases (`entra a la sección …`, `llena`, `simula`, `botón de …`), so most prompts, and every non-Spanish prompt, fail with "no plan could be derived". Plan files already solve this for any language, but they require a YAML wrapper. Users and agents should be able to pass just the steps as the prompt, as a list separated by commas, line breaks, numbers, or dashes, and get the same step-by-step execution as a plan file.

## What Changes

- A positional prompt or `--prompt-file` is split into ordered natural-language steps:
  - on line breaks, with leading list markers (`-`, `*`, `•`, `1.`, `1)`) removed;
  - on inline sequential numbering (`1. … 2. … 3. …`);
  - on commas and semicolons outside double quotes.
  - A prompt with no separators is one step.
- The split steps run exactly like a plan file's natural-language steps: Jev classifies them before the browser launches, `compound` steps are rejected, targets must be anchored in the step text, and the run follows plan semantics.
- New offline subcommand `cordy plan from-prompt <text|->` prints the plan that a prompt splits into, as YAML, so users can check the split and turn it into a plan file.
- **BREAKING**: the Spanish regex planner (`workflow-plan.ts:createWorkflowPlan`) is removed. Prompts are no longer read for `entra a la sección`, `llena`, or `simula`, and no hard-coded `simular` click is derived. `Entra a la sección X, llena el formulario y simula.` is now split into two steps, and the second is rejected as compound.
- **BREAKING**: expectation inference from the prompt (`botón de …`) is removed. Expectations come only from `--expect` and the legacy `--expect-*` flags.
- **BREAKING**: prompt runs follow plan semantics. They continue after a high-impact click until the last step, fail when a step is incomplete, and fail when an input is not used. The prompt-only stop rules from `constrain-prompt-runs` are removed.
- **BREAKING**: the `--json` result no longer has a `plan` (`WorkflowPlan`) field. Every run reports `planSteps`.
- Value warnings for e-mail addresses and long digit sequences apply to prompt steps too.

## Capabilities

### New Capabilities
- `prompt-step-lists`: splitting a prompt into ordered natural-language steps, running them with plan semantics, and the `plan from-prompt` subcommand.

### Modified Capabilities
- `prompt-planning`: both requirements (regex-derived steps and button inference) are removed.
- `prompt-run-safety`: the prompt-only stop and failure rules are removed. The high-impact name rule stays and now applies to every run.
- `workflow-plan-file`: the regex planner fallback requirement is removed.
- `plan-step-execution`: high-impact and value-warning requirements no longer distinguish a regex prompt mode.
- `result-expectations`: legacy flags no longer merge prompt-inferred expectations.

These capabilities come from the active changes `neutralize-client-phrases`, `constrain-prompt-runs`, `natural-language-plan`, and `declarative-expectations`. Archive those four changes before this one, so that the deltas apply to synced main specs.

## Impact

- Code:
  - removed: `src/workflow-plan.ts`, `src/expectations.ts`, `stepsFromWorkflowPlan`;
  - new: a prompt splitter module;
  - changed: `src/run.ts` (a single plan path), `src/app.ts` (`plan from-prompt`), `src/plan-file.ts` (reused step model), `src/index.ts` exports.
- Tests: regex-planner and inference tests are removed or rewritten as splitter and run tests. Spanish prompt fixtures that exist only for the regexes go away.
- Docs:
  - README intro, examples, and the "prompt runs end" section;
  - docs/USAGE.md;
  - CLAUDE.md architecture (steps 3–5) and the language rule's exception for regex-parsed prompts, which no longer applies.
- JSON consumers relying on `result.plan` must switch to `result.planSteps`.
