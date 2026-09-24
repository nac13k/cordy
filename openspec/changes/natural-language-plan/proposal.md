## Why

Cordy derives its workflow plan from the prompt with Spanish regexes tuned to one application. An English prompt yields an incomplete plan that silently drops navigation, the final click, and the checks. A prompt with no inputs crashes with a raw schema error. Hard-coded targets taken from that application's labels make the planner useless for other apps. The plan is Cordy's safety contract with Jev (steps cannot be skipped, targets must match), so it needs a source that works in any language and domain and that both people and LLM agents can write.

## What Changes

- New `--plan <path>` flag (`--plan -` reads stdin). A plan file is YAML (JSON also accepted) with `version: 1`, an optional `description`, and an ordered list of `steps`.
- A step is either one natural-language instruction in any language (`- da clic en la sección registrate`) or an explicit single-key form: `click: <target>`, `submit: <target>`, `fill: [keys]`, or `wait: load`.
- Before any page action, Jev classifies each natural-language step as `click`, `fill`, `wait`, `submit`, or `compound`, using the existing `choice` question format. A plan with a compound step (more than one action) is rejected, naming the step.
- Cordy keeps a local step cursor. Steps run strictly in order, and completion is decided locally.
- Target anchoring without language rules: for click and submit steps, the name of the element Jev chooses must appear in the step text (normalized for accents, case, and punctuation). Quoted text in a step (`"Regístrate"`) acts as an exact anchor.
- `fill` steps written in natural language consume whichever pending inputs belong to the current screen, so multi-page wizards work. If any provided input is still unconsumed when the plan ends, the run fails.
- `wait` steps always wait for the page load. Durations in the text are ignored and never become fixed sleeps.
- `submit` steps are high impact and require `--approve`. A click is also high impact when the existing high-impact name rule matches, so a plan can raise protection but never lower it. In plan mode the run continues after a high-impact click until the last step.
- **BREAKING**: `--approve` is enforced in both plan and regex modes. Before, high-impact clicks were always executed and `--approve` was a compatibility no-op. Now, without `--approve`, they are blocked.
- `--dry-run` shows how each step was interpreted.
- New `cordy plan init`, `cordy plan schema` (JSON Schema for LLM structured output), and `cordy plan check <file>` (offline validation).
- Warnings when a step's text looks like it contains an input value (e-mail addresses, long digit sequences), since step text is sent to Jev.
- Without `--plan`, the current regex planner is unchanged, and it is also changed to report a clear error instead of a raw schema error when it cannot derive any step.

## Capabilities

### New Capabilities
- `workflow-plan-file`: The plan file format, loading, validation errors, and the `plan init`, `plan schema`, and `plan check` subcommands.
- `plan-step-execution`: Step classification by Jev, compound-step rejection, the step cursor, target anchoring, per-kind completion rules, high-impact handling, input consumption checks, dry-run interpretation, and value warnings.

### Modified Capabilities
<!-- None: no baseline specs exist yet under openspec/specs/. -->

## Impact

- **Code**: new `src/plan-file.ts` (schema, loader, JSON Schema export, template), `src/app.ts` (`plan` subcommands, help), `src/cli-options.ts` (`--plan`), `src/workflow-plan.ts` (plan steps from a file, clear error for empty regex plans), `src/jev.ts` (classification request, anchor validation for natural-language steps, plan mode skips prompt-specific corrections), `src/run.ts` (explicit step cursor, completion rules, continuing after high-impact clicks in plan mode, end-of-plan input check).
- **Jev contract**: a new classification request made of `choice` questions. It must be confirmed with Jev before implementation.
- **Invariants**: `CLAUDE.md` is updated. Jev also classifies plan steps, and in plan mode the run stops after the last step instead of right after the first high-impact click.
- **Depends on**: `fix-action-parity` (consumption by key) and `file-upload-inputs` (file keys consumed by `fill` steps).
- **Docs**: `README.md` and `docs/USAGE.md` gain a plan section. Spanish examples stay in Spanish where they exercise the regex planner.
