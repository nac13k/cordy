# Cordy Usage Guide

This guide expands on the README for teams that install Cordy from npm and use it for reproducible Playwright flows.

## 1. Mental model

Cordy separates four responsibilities:

1. The user describes the flow and provides explicit inputs.
2. Cordy observes accessible controls and a reduced page state.
3. Jev proposes a structured action from the allowed set.
4. Cordy validates the action and Playwright executes it.

Jev is not a code executor. It never receives API keys, cookies, authorization headers, real input values, full HTML, or full page text.

> **Prompt language:** Cordy's workflow planner and expectation inference currently match Spanish phrasing (for example `entra a la seccion ...`, `resultado esperado`, `boton de ...`). The example prompts in this guide are therefore kept in Spanish on purpose: they are input data for Cordy, not documentation prose.

## 2. Recommended installation

For a test project:

```bash
npm install --save-dev @nac13k/cordy
npx playwright install chromium
```

For a one-off try:

```bash
npx @nac13k/cordy@0.1.1 --help
npx playwright install chromium
```

Cordy requires Node.js `>=20`. The package publishes the `cordy` binary and the ESM API in `dist`.

## 3. Environment and configuration

Set the secret in the environment:

```bash
export JEV_API_KEY='...'
```

Generate a template:

```bash
npx cordy init
# or
npx cordy init --format yaml
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
npx cordy \
  "Completa el registro" \
  --start-url https://example.test \
  --input email='correo+${timestamp()}@example.com' \
  --input nombre='${faker.name}' \
  --input referencia='dias ${randInt(10, 99)}'
```

Templates are resolved once per run, in memory. `eval`, `process.env`, imports, arbitrary calls, and functions outside the allowlist are rejected. Generated outputs keep the input source: `key=value` values go into `const input`, and their templates are evaluated at the start of every run, while an input file is read with `readFileSync` when the test runs. Sensitive keys are never embedded and stay as environment variables.

## 4. Full flow with inferred expectations

```bash
npx cordy \
  "simula un credito entrando a la seccion cotiza tu envio y llenando el formulario y al simular debe de presentar como resultado esperado una pantalla con los resumen del envio y un boton de guardar cotización" \
  --start-url https://example.test \
  --input peso=3500000 \
  --input monto=2500000 \
  --output ./playwright/cotizar-envio.spec.ts \
  --output-kind test \
  --headed \
  --verbose
```

The phrase `resultado esperado` ("expected result") and the explicit conditions let Cordy infer:

- visible text or a region related to `resumen del envio` ("shipment summary");
- a visible element with role `button` and a name similar to `guardar cotización` ("save quote").

Expectations are checked after the last click of the flow. The generated test keeps the assertions.

## 5. Explicit expectations

Use explicit flags if you want to keep the specification separate from the prompt:

```bash
--expect-visible "Resumen de la solicitud"
--expect-button "Guardar cotización"
--expect-url "https://example.test/resultado"
```

Each flag is repeatable. Explicit expectations are added to the inferred ones; they don't replace local validation.

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
npx cordy "Simula un crédito con el formulario nuevo" \
  --start-url https://staging.example.test \
  --output ./playwright/flows.spec.ts \
  --test-name cotizar-envio \
  --update --diff
```

`--diff` runs the flow and prints the diff instead of writing the file. It can't be combined with `--dry-run`.

To see which tests Cordy manages in a file and copy their slugs:

```bash
npx cordy tests ./playwright/flows.spec.ts
npx cordy tests ./playwright/flows.spec.ts --json
```

`cordy tests` never opens the browser, and it exits with code `1` if it finds damaged markers or the file doesn't exist.

## 7. Safe execution

Use `--dry-run` to inspect the plan without executing actions:

```bash
npx cordy \
  "Completa el flujo" \
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

Current flows are test flows and stop after the final high-impact click chosen by Jev. Don't run a flow against production without external safeguards.

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
npx cordy ... --json > result.json
```

Each record has `kind`, `expected`, and `status`. A `failed` expectation returns exit code `1`.

## 9. CI and artifacts

Example:

```bash
npm ci
npx playwright install --with-deps chromium

npx cordy \
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
