# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Cordy is a TypeScript (ESM, Node >= 20) CLI and library that runs Playwright browser flows from natural-language instructions. An external reasoning service, **Jev**, only *proposes* structured decisions. Cordy validates them locally, and Playwright executes them. `README.md` is the user-facing reference for CLI flags, config, and dynamic inputs. `docs/USAGE.md` is a longer usage guide.

## Language

Everything written into the project must be in English, whatever language is used while planning or building with agents. This covers code, comments, identifiers, CLI messages and errors, tests, commit messages, PR titles and descriptions, docs, and OpenSpec artifacts (proposals, designs, specs, tasks).

The one exception is prompt text that Cordy itself parses. The planner and expectation regexes match Spanish phrasing, so Spanish example prompts and test fixtures that exercise those regexes stay in Spanish. Explain them in English wherever they appear.

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
2. **Inputs.** `inputs.ts` loads the prompt and inputs (`key=value` or a JSON file). `dynamic-inputs.ts` resolves allowlisted `${...}` templates such as `timestamp()`, `randInt()`, and `faker.*` once per run. Nothing is `eval`'d.
3. **Plan.** `workflow-plan.ts:createWorkflowPlan` builds an ordered, in-memory `WorkflowPlan` (navigate_section → click → fill_inputs → final-impact click → assert) with **Spanish-language regexes** over the prompt. `expectations.ts:inferExpectations` works the same way. Changing the wording those regexes match changes behavior.
4. **Step loop** (up to `maxSteps`):
   - `observe.ts:observePage` collects interactive elements with locator candidates and a redacted `valueState` (`empty`/`filled`/`secret_or_redacted`). It never collects values.
   - `jev.ts:JevClient.nextAction` sends the state, input *names only*, and the current workflow step's allowed actions to Jev as `choice` questions. It then validates the answer locally: the action must be allowed for the step, the target must exist, the role must be compatible, and `matchesTarget` must match the step target. On any mismatch it returns `needs_review` instead of throwing.
   - `run.ts:execute` maps a `PlannedAction` to a Playwright call through `locatorFor`. A final-impact click is downgraded to `needs_review` if visible textboxes are still empty.
   - The loop stops on the first non-`succeeded` record, or right after a `highImpact` click.
5. **Expectations** (visible text, button by role, URL) are checked live at the end. In dry-run they are marked `planned`. Any failed action or expectation makes the exit code `1`.
6. **Codegen.** `generateTypeScript` replays succeeded actions as a `@playwright/test` spec (`test`) or a plain script (`automation`). Generated code imports `resolveInputRecord` from `cordy`, so templates are re-evaluated on every run. Sensitive-looking keys become `process.env[...]` references.

`domain.ts` holds the shared zod schemas (`PlannedAction` discriminated union, `LocatorSpec`, `BrowserState`, `ActionRecord`). `index.ts` is the public programmatic API.

## Invariants to preserve

- Jev never receives real input values, API keys, cookies, full HTML, or full page text, and it can only choose from `goto/fill/select/check/click/wait/needs_review`. It must not execute code.
- The API key comes only from the env var named in config (`jev.api_key_env`, default `JEV_API_KEY`). It is never a CLI arg and never written to config.
- `--verbose` diagnostics go to stderr and must stay redacted: URLs are reduced to origin + path, and only input names are shown. stdout must stay clean JSON under `--json`.
- Workflow steps cannot be skipped. A target mismatch blocks the action rather than navigating elsewhere.
- Tests inject a fake `fetcher` into `JevClient`. Don't add tests that hit the real Jev endpoint.
