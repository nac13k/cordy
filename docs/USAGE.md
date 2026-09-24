# Cordy Usage Guide

This guide expands on the README for teams that install Cordy from npm and use it for reproducible Playwright flows.

## 1. Mental model

Cordy separates four responsibilities:

1. The user describes the flow and provides explicit inputs.
2. Cordy observes accessible controls and a reduced page state.
3. Jev proposes a structured action from the allowed set.
4. Cordy validates the action and Playwright executes it.

Jev is not a code executor. It never receives API keys, cookies, authorization headers, real input values, full HTML, or full page text.

> **Prompts are step lists:** write the steps in any language, separated by commas, line breaks, numbers (`1.`, `1)`), or leading dashes. Cordy splits them locally, and Jev classifies each step before the browser opens. Some examples in this guide are in Spanish to show that the language does not matter. Run `cordy plan from-prompt '<prompt>'` to see the split offline.

## 2. Recommended installation

For a test project:

```bash
npm install --save-dev @nac13k/cordy
npx playwright install chromium
```

For a one-off try:

```bash
npx @nac13k/cordy@0.2.0 --help
npx playwright install chromium
```

Cordy requires Node.js `>=20`. The package `@nac13k/cordy` publishes the `cordy` binary and the ESM API in `dist`. The examples below use `npx @nac13k/cordy`, which runs the locally installed binary when there is one. Avoid `npx cordy`: the unscoped `cordy` package on npm is an unrelated project.

## 3. Environment and configuration

Set the secret in the environment:

```bash
export JEV_API_KEY='...'
```

Generate a template:

```bash
npx @nac13k/cordy init
# or
npx @nac13k/cordy init --format yaml
```

The configuration uses `api_key_env`, not `api_key`:

```toml
[jev]
api_key_env = "JEV_API_KEY"

[browser]
headed = false
max_steps = 20
```

Never put secrets in TOML, YAML, CLI arguments, input JSON, generated code, or logs.

## Dynamic inputs

Cordy supports a closed DSL for variable data, without running arbitrary JavaScript:

```text
${timestamp()}
${randInt()}
${randInt(100, 999)}
${faker.name}
${faker.email}
${faker.firstName}
${faker.lastName}
${faker.phone}
```

Example:

```bash
npx @nac13k/cordy \
  "Llena el formulario de registro" \
  --start-url https://example.test \
  --input email='correo+${timestamp()}@example.com' \
  --input nombre='${faker.name}' \
  --input referencia='dias ${randInt(10, 99)}'
```

Templates are resolved once per run, in memory. `eval`, `process.env`, imports, arbitrary calls, and functions outside the allowlist are rejected. Generated outputs keep the input source: `key=value` values go into `const input`, and their templates are evaluated at the start of every run, while an input file is read with `readFileSync` when the test runs. Sensitive keys are never embedded and stay as environment variables.

## File uploads

Use `--file key=path[,path...]`, or a typed entry `{ "type": "file", "path": "..." }` (or `"paths": [...]`) in the inputs JSON file:

```bash
npx @nac13k/cordy \
  "Llena el formulario de registro" \
  --start-url https://example.test \
  --file id_document=./fixtures/id.pdf
```

Paths are relative to the working directory (the project root), and each file must exist before the run starts. Jev only learns that the key is a file input. Cordy uploads into `<input type="file">` controls, including hidden ones, and blocks the upload when the control's `accept` list or `multiple` setting does not fit the files. Generated code keeps the same relative paths in a `files` constant.

## 4. Full flow with expectations

```bash
npx @nac13k/cordy \
  $'1. Entra a la sección "Cotizador de envíos"\n2. Llena el formulario\n3. Clic en "Simular"' \
  --start-url https://example.test \
  --input peso=2 \
  --input codigo_postal=44100 \
  --expect 'text:Resumen del envío' \
  --expect 'button:Guardar cotización' \
  --output ./playwright/cotizar-envio.spec.ts \
  --output-kind test \
  --approve \
  --headed \
  --verbose
```

(The steps are in Spanish to show that any language works; `Cotizador de envíos`, `Simular`, `Resumen del envío`, and `Guardar cotización` are the example app's labels.) The prompt splits into three steps: a click on the `Cotizador de envíos` section, a fill that uses `peso` and `codigo_postal`, and a click on `Simular`. `Simular` is a high-impact name, so the click needs `--approve`. Cordy never infers expectations from the prompt, so the result text and the button are declared with `--expect`.

Expectations are checked after the last step. The generated test keeps the assertions.

## Plan files

A plan file holds the same steps as a prompt, plus an optional description and explicit step forms:

```bash
npx @nac13k/cordy plan init plan.yaml      # commented example
npx @nac13k/cordy plan check plan.yaml     # offline validation
npx @nac13k/cordy plan from-prompt '…'     # print the plan a prompt splits into
npx @nac13k/cordy --plan plan.yaml --start-url https://example.test --input email=ana@example.com --approve
```

Each step is one natural-language instruction in any language, which Jev classifies as `click`, `fill`, `wait`, or `submit` before the browser opens. It can also be an explicit form: `{ click: X }`, `{ submit: X }`, `{ fill: [keys] }`, or `{ wait: load }`. Steps that combine two actions are rejected. Clicked controls must be named in the step text, and quoted names must match exactly. A natural-language `fill` consumes the inputs visible on the current screen, and every input must be used by the end of the plan. `wait` always waits for the page load. `cordy plan schema` prints the JSON Schema for agents that generate plans.

## 5. Explicit expectations

Use `--expect '[not-]<kind>:<arg>'` to keep the specification separate from the prompt. It is repeatable, and the grammar is compact enough for an agent to generate:

```bash
--expect 'text:Resumen del envío'
--expect 'button:Guardar cotización'
--expect 'value:Peso=${input.peso}'
--expect 'not-text:/error|requerido/i'
--expect 'url:/\/resultado$/'
```

(The expected texts are Spanish because they are the example app's labels.)

The kinds are `text`, `button`, `button-enabled`, `button-disabled`, `url`, `title`, `value` (`<label>=<m>`), `checked`, `unchecked`, and `count` (`<m>=<n>`). A matcher is a case-insensitive substring, a `/regex/flags`, or contains `${input.<key>}`. Use single quotes so the shell does not expand `$`. Each expectation retries for up to 5 seconds, and negated ones run last. `--expect-visible`, `--expect-button`, and `--expect-url` (exact match) still work as aliases. Expectations are never inferred from the prompt, and they don't replace local validation.

## 6. `test` vs. `automation`

`--output-kind test` generates a file that `@playwright/test` can run:

```tsx
import { expect, test } from '@playwright/test';
```

It includes `expect(...).toBeVisible()` and `expect(page).toHaveURL(...)`.

`--output-kind automation` generates a Playwright script that uses `waitFor` for expectations, without importing `@playwright/test`.

No file is written if you omit `--output`.

### Several named tests in one file

With `--test-name <slug>`, Cordy writes the test as a named block and can add it to a file that already contains other tests. The slug accepts only lowercase letters, digits, and single hyphens, with a maximum of 64 characters. It is also the test title, so `npx playwright test -g <slug>` runs it. It only works with `--output-kind test`.

```ts
// cordy:begin cotizar-envio
test('cotizar-envio', async ({ page }) => {
  // ...
});
// cordy:end cotizar-envio
```

- **Without `--update`**: appends the block to the end of the file, or creates the file if it doesn't exist. If a test with that slug already exists, it fails and suggests `--update`.
- **With `--update`**: replaces the existing block in place. If the slug doesn't exist, it fails.
- **Imports**: merged into the file header without duplicates. Code outside the markers is never touched.
- **Preflight validation**: conflicts and damaged markers are detected before the browser opens.
- **Failures**: if any action or expectation fails, the file is not modified.

```bash
npx @nac13k/cordy 'Llena el formulario nuevo, clic en "Simular"' \
  --start-url https://staging.example.test \
  --output ./playwright/flows.spec.ts \
  --test-name cotizar-envio \
  --update --diff
```

`--diff` runs the flow and prints the diff instead of writing the file. It can't be combined with `--dry-run`.

To see which tests Cordy manages in a file and copy their slugs:

```bash
npx @nac13k/cordy tests ./playwright/flows.spec.ts
npx @nac13k/cordy tests ./playwright/flows.spec.ts --json
```

`cordy tests` never opens the browser, and it exits with code `1` if it finds damaged markers or the file doesn't exist.

## 7. Safe execution

Use `--dry-run` to inspect the plan without executing actions:

```bash
npx @nac13k/cordy \
  'Llena el formulario, clic en "Enviar"' \
  --start-url https://staging.example.test \
  --input email=ana@example.com \
  --dry-run \
  --json
```

`--dry-run` never writes the `--output` file. With `--test-name`, it prints a preview instead: the import changes as a diff, and whether the test would be appended or replaced, with its current lines.

Use `--headed` to debug selectors and navigation. Use `--headless` in CI. Tune `--max-steps` to avoid loops:

```bash
--max-steps 12
```

High-impact clicks run only with `--approve`; without it they are recorded as `blocked`. After a high-impact click, the run continues with its remaining steps. Don't run a flow against production without external safeguards.

## Use Cordy from an agent

Cordy ships an agent skill (`SKILL.md`) that teaches coding agents how to run it safely: prompts as step lists, values through `--input`, `--dry-run` and `--json` first, and `--approve` only with the user's consent. Install it for one or more agents:

```bash
npx @nac13k/cordy skill install --agent claude
npx @nac13k/cordy skill install --agent codex,pi --global
npx @nac13k/cordy skill install --agent all
```

| Agent      | Project (default) | `--global`            |
| ---------- | ----------------- | --------------------- |
| `claude`   | `.claude/skills/` | `~/.claude/skills/`   |
| `codex`    | `.agents/skills/` | `~/.agents/skills/`   |
| `hermes`   | `.hermes/skills/` | `~/.hermes/skills/`   |
| `openclaw` | `skills/`         | `~/.openclaw/skills/` |
| `pi`       | `.pi/skills/`     | `~/.pi/agent/skills/` |

Each agent gets `cordy/SKILL.md` under its directory. An existing file is left unchanged (and the command exits with code `1`) unless you add `--force`, so rerun with `--force` after upgrading Cordy to refresh the skill.

For other agents, or to let the agent write the file itself:

```bash
npx @nac13k/cordy skill print > SKILL.md          # the raw skill
npx @nac13k/cordy skill prompt                    # a prompt to paste into any agent
npx @nac13k/cordy skill prompt --agent codex      # the same, naming Codex's path
```

The `skill` commands never contact Jev, open a browser, or need `JEV_API_KEY`.

## 8. Troubleshooting

### Invalid URL

Wrong:

```text
example.test
```

Right:

```text
https://example.test
```

### Missing credential

Check only that the variable exists, without printing it:

```bash
if [ -n "$JEV_API_KEY" ]; then echo "JEV_API_KEY is set"; else echo "JEV_API_KEY is missing"; fi
```

### Blocked action

A response like:

```text
Jev proposed fill on an element with role=button
```

means local validation rejected an action/role combination. Don't disable that protection; use `--verbose` and `--headed` and inspect the observed page.

### Failed expectation

Run with `--json` and check `expectations`:

```bash
npx @nac13k/cordy ... --json > result.json
```

Each record has `kind`, `expected`, and `status`. A `failed` expectation returns exit code `1`.

## 9. CI and artifacts

Example:

```bash
npm ci
npx playwright install --with-deps chromium

npx @nac13k/cordy \
  --prompt-file tasks/flow.txt \
  --input tasks/flow.inputs.json \
  --start-url https://staging.example.test \
  --headless \
  --output artifacts/flow.spec.ts \
  --output-kind test \
  --json > artifacts/flow.result.json
```

The secret must come from your CI secret manager. Don't store the input JSON if it contains sensitive data. Publish artifacts only after checking that they contain no private values.

## 10. Preparing for npm

Before publishing or updating:

```bash
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

`npm pack --dry-run` must include at least:

```text
README.md
LICENSE
dist/
```

And must not include:

```text
.env
credentials
private logs
temporary files
```

For an authorized release:

```bash
npm whoami
npm version patch
npm publish
```

The public API is at version `0.x`; pin a version in CI projects if you need reproducibility.
