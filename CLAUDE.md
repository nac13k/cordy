# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Cordy is a TypeScript (ESM, Node >= 20) CLI and library that runs Playwright browser flows from natural-language instructions. An external reasoning service, **Jev**, only _proposes_ structured decisions. Cordy validates them locally, and Playwright executes them. `README.md` is the user-facing reference for CLI flags, config, and dynamic inputs. `docs/USAGE.md` is a longer usage guide.

## Language

Everything written into the project must be in English, whatever language is used while planning or building with agents. This covers code, comments, identifiers, CLI messages and errors, tests, commit messages, PR titles and descriptions, docs, and OpenSpec artifacts (proposals, designs, specs, tasks).

Nothing in Cordy parses prompt wording, so example prompts and fixtures can be in English. A few tests and examples use Spanish step texts on purpose, to show that any language works. Keep them, and explain them in English where they appear.

## Commands

```bash
npm ci && npx playwright install chromium   # setup
npm test                                    # vitest run (all tests)
npx vitest run test/jev.test.ts             # single file
npx vitest run -t "Jev planner"             # single test by name
npm run typecheck                           # tsc --noEmit (npm run lint is the same)
npm run format / npm run format:check       # prettier over src/ and test/ only
npm run build                               # tsup -> dist/index.js + dist/cli.js (ESM + .d.ts)
node dist/cli.js --help                     # run the built CLI
```

Before calling a change done, run `format:check`, `typecheck`, `test`, and `build`. Vitest excludes `playwright/`, which is gitignored and holds scratch generated specs. `fixture/index.html` is a minimal local page for manual runs.

## Architecture

Execution flow (`src/run.ts` → `runCordy`):

1. **Entry.** `cli.ts` calls `app.ts:main`, which handles `init`, parses flags with `cli-options.ts` (validated by zod), and merges them with `config.ts` (TOML/YAML autodiscovery). CLI flags override config, except `maxSteps`: the config value applies only when the CLI value is the default of 20.
2. **Inputs.** `inputs.ts` loads the prompt (positional or `--prompt-file`) and inputs (`key=value` or a JSON file). `dynamic-inputs.ts` resolves allowlisted `${...}` templates such as `timestamp()`, `randInt()`, and `faker.*` once per run. Nothing is `eval`'d.
3. **Plan.** Every run is a `LoadedPlan`:
   - With `--plan`, `plan-file.ts` loads a YAML/JSON plan (natural-language or explicit steps).
   - Without it, `prompt-steps.ts:planFromPrompt` splits the prompt into natural-language steps. It splits on line breaks (stripping `-`/`*`/`•`/`1.`/`1)` markers), on sequential inline numbering, and on commas/semicolons outside double quotes, and it enforces the plan limits. `cordy plan from-prompt` prints the split as YAML.
   - `JevClient.classifySteps` classifies the natural-language steps as `click`/`fill`/`wait`/`submit` before the browser launches, and rejects `compound` steps.
   - `stepsFromPlanFile` turns the plan into `PlanStep[]` (`plan-steps.ts`), executed with an explicit cursor. For a prompt, the task sent to Jev is the prompt text.
4. **Step loop** (up to `maxSteps`):
   - `observe.ts:observePage` collects interactive elements with locator candidates and a redacted `valueState` (`empty`/`filled`/`secret_or_redacted`). It never collects values. Besides semantic controls it observes tabs/menu items/options/switches, `summary`, `a` without `href`, `[onclick]`, and outermost `cursor: pointer` elements; those without an ARIA role get role `clickable` and a `getByText` candidate for their first text line. When a first candidate matches several elements, `pinAmbiguousCandidates` adds `nth` using Playwright's own matching, and `locators.ts` applies and renders it as `.nth(n)`.
   - `jev.ts:JevClient.nextAction` sends the state, input _names only_, and the current workflow step's allowed actions to Jev as `choice` questions. It then validates the answer locally: the action must be allowed for the step, the target must exist, the role must be compatible, and `matchesTarget` must match the step target. On any mismatch it returns `needs_review` instead of throwing.
   - `run.ts:execute` maps a `PlannedAction` to a Playwright call through `locatorFor`. A final-impact click is downgraded to `needs_review` if visible textboxes are still empty.
   - Natural-language click/submit targets must be anchored in the step text (`jev.ts:anchoredIn`). A natural-language fill step ends when Jev picks no input key (`step_complete`).
   - `submit` steps force `highImpact`, and high-impact clicks require `--approve` in both modes.
   - The loop stops when the cursor passes the last step (Jev is never asked for actions outside a step) or on the first non-`succeeded` record. It continues after a `highImpact` click. The run fails if a step is incomplete (including when `--max-steps` ends it) or any input was not used.
   - A click is high impact on a submit step or when the control name matches `jev.ts:HIGH_IMPACT_WORDS` (Spanish and English submission verbs).
5. **Expectations** come from `--expect '[not-]<kind>:<arg>'` (parsed in `expectation-spec.ts`) and the legacy `--expect-*` aliases (`collectExpectations`). They are never inferred from the prompt. `expectation-check.ts` verifies them live at the end with Playwright `expect` (5-second retries, negated ones last) and renders the same assertions for codegen. In dry-run they are marked `planned`. Any failed action or expectation makes the exit code `1`. Expectations are never sent to Jev.
6. **Codegen.** `generateTypeScript` replays succeeded actions as a `@playwright/test` spec (`test`) or a plain script (`automation`). Generated code imports `resolveInputRecord` from `cordy`, so templates are re-evaluated on every run. Sensitive-looking keys become `process.env[...]` references.

`domain.ts` holds the shared zod schemas (`PlannedAction` discriminated union, `LocatorSpec`, `BrowserState`, `ActionRecord`). `index.ts` is the public programmatic API.

## Invariants to preserve

- Jev never receives real input values, API keys, cookies, full HTML, or full page text, and it can only choose from `goto/fill/select/check/click/wait/needs_review` (plus classifying plan steps as `click/fill/wait/submit/compound`). It must not execute code. `upload` and `step_complete` are local actions Cordy derives from Jev's answers.
- The API key comes only from the env var named in config (`jev.api_key_env`, default `JEV_API_KEY`). It is never a CLI arg and never written to config.
- `--verbose` diagnostics go to stderr and must stay redacted: URLs are reduced to origin + path, and only input names are shown. stdout must stay clean JSON under `--json`.
- Workflow steps cannot be skipped. A target mismatch blocks the action rather than navigating elsewhere.
- High-impact clicks require `--approve`. A plan can raise protection (`submit`) but never lower it: the high-impact name rule always applies.
- Tests inject a fake `fetcher` into `JevClient`. Don't add tests that hit the real Jev endpoint.
