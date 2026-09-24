<p align="center">
  <img src="docs/assets/cordy-logo-transparent.png" alt="Cordy — Playwright AI automated control" width="420" />
</p>

<p align="center">
  <strong>Playwright AI // Automated Control</strong><br />
  Natural-language guided web test automation.
</p>

# Cordy

Cordy is a TypeScript CLI for designing and running Playwright automations from natural-language instructions. It combines Jev's semantic interpretation with local validation and controlled browser execution.

## What is it for?

Cordy turns an instruction such as:

```text
Go to the shipping quote section, fill in the form, and click Simulate.
```

into a reproducible test flow:

1. Observe the visible controls on the page.
2. Build and validate an ordered execution plan.
3. Ask Jev only for the structured decision for the current step.
4. Validate the proposed locator, role, and action locally.
5. Let Playwright execute the interaction.
6. Check the explicit result expectations.
7. Optionally generate a TypeScript test ready for `@playwright/test`.

Cordy does not allow Jev to execute arbitrary JavaScript or Playwright. Jev proposes structured decisions; Cordy keeps control of the workflow, and Playwright executes only the allowed actions.

## Why is it called Cordy?

**Cordy** combines two ideas at the center of the project: **coordination** and **Cordyceps**. The name reflects Cordy's role as a coordinator between a natural-language instruction, an external reasoning agent, and a controlled browser runtime.

The Cordyceps reference also connects to the visual identity: a brain and a mushroom growing over a branching network. It represents an external agent that can suggest what should happen, while Cordy remains the local control layer that validates, constrains, and coordinates what is actually executed.

The name is short and memorable, but its meaning is intentional: the user expresses intent in natural language, Jev helps interpret it, Cordy controls the boundary and the sequence, and Playwright performs the verifiable browser work.

> Cordy is designed for test flows. During a normal execution it fills the inputs, performs the selected final click, and stops immediately after that action. Do not use it against production systems or for irreversible operations without independent authorization.

## Requirements

- Node.js 20 or newer.
- Playwright Chromium installed on the machine that will run Cordy.
- A Jev credential available only as an environment variable.
- An absolute starting URL, including `https://` or `http://`.

Check Node.js:

```bash
node --version
```

## Install from npm

### One-off execution with `npx`

You do not need to install Cordy globally:

```bash
npx @nac13k/cordy --help
```

To prevent `npx` from unexpectedly selecting a different version, pin the version:

```bash
npx @nac13k/cordy@0.1.1 --help
```

Install Playwright browsers once per machine:

```bash
npx playwright install chromium
```

### Local installation in a project

Recommended for reproducible test suites:

```bash
npm install --save-dev @nac13k/cordy
npx playwright install chromium
```

Run the local binary:

```bash
npx cordy "Complete the form" --start-url https://example.test
```

### Global installation

```bash
npm install --global @nac13k/cordy
npx playwright install chromium
cordy --help
```

A global installation is convenient for manual use, but a local dependency pins the version more reliably in CI and on shared machines.

## Configure Jev

Cordy does not accept the API key as a command-line argument and does not store it in the configuration file. Define the variable only in the process environment:

```bash
export JEV_API_KEY='your-jev-credential'
```

You can also load it from a `.env` file through your secret manager or your shell's environment mechanism. Do not commit `.env` to Git.

Cordy uses this variable by default:

```text
JEV_API_KEY
```

To change the variable name, create a configuration file:

```bash
npx cordy init
```

This creates `cordy.config.toml`:

```toml
[jev]
api_key_env = "JEV_API_KEY"
# endpoint = "https://api.typesafe.ai/v1/systemone"

[browser]
headed = false
max_steps = 20
# start_url = "https://example.test"
# origin = "https://example.test"
```

The configuration contains only the environment-variable name, never its value. You can also generate YAML:

```bash
npx cordy init --format yaml
```

Cordy automatically discovers the first existing file in the current directory from this list:

```text
cordy.config.toml
cordy.config.yaml
cordy.config.yml
```

Use `--config` to provide an explicit path:

```bash
npx cordy --config ./config/cordy.config.toml \
  "Complete the form" \
  --start-url https://example.test
```

## First flow

```bash
export JEV_API_KEY='your-jev-credential'

npx cordy \
  "Complete the registration form" \
  --start-url https://example.test/registration \
  --input email=ana@example.com \
  --input name=Ana \
  --headless
```

The starting URL must be absolute. This is valid:

```text
https://example.test
```

This is not valid for Playwright:

```text
example.test
```

To show the browser:

```bash
npx cordy \
  "Complete the registration form" \
  --start-url https://example.test/registration \
  --input email=ana@example.com \
  --headed
```

`--headless` is the default behavior and can be used explicitly.

## Inputs

### `key=value` inputs

Repeat `--input` for every value required by the flow:

```bash
npx cordy \
  "Get a shipping quote" \
  --start-url https://example.test \
  --input peso=2 \
  --input codigo_postal=44100
```

Values are used locally to execute `fill`, `select`, or `check`. Jev receives input names and availability, but never the real values.

An argument is read as `key=value` whenever the text before the first `=` is a valid key (a letter or `_`, then letters, digits, `_`, `.`, or `-`). The value can contain anything, including `=` or a path such as `--input report=./data/report.json`. Any other argument is read as the path of a JSON inputs file.

Inputs used to set a checkbox (`check`) must be `true` or `false` (case-insensitive). Any other value fails the action instead of leaving the checkbox unchecked, both in the live run and in generated code.

### Inputs from JSON

Create `inputs.json`:

```json
{
  "email": "ana@example.com",
  "name": "Ana",
  "codigo_postal": "44100"
}
```

Pass it with `--input`:

```bash
npx cordy \
  --prompt-file ./task.txt \
  --input ./inputs.json \
  --start-url https://example.test
```

Do not store passwords or tokens in a versioned JSON file. Use a secret store or generate the file temporarily outside the repository.

### File uploads

Pass files with `--file key=path`. Repeat the flag for each file input, and separate several files for one input with commas:

```bash
npx cordy \
  "Completa el registro y sube la identificación" \
  --start-url https://example.test \
  --input name=Ana \
  --file id_document=./fixtures/id.pdf \
  --file attachments=./fixtures/a.pdf,./fixtures/b.pdf
```

(The prompt is Spanish on purpose; it is the phrasing Cordy's planner parses.)

In an inputs JSON file, use a typed entry:

```json
{
  "name": "Ana",
  "id_document": { "type": "file", "path": "./fixtures/id.pdf" },
  "attachments": { "type": "file", "paths": ["./fixtures/a.pdf", "./fixtures/b.pdf"] }
}
```

- Paths are relative to the directory where you run the command, which is expected to be the project root. This also applies to paths inside an inputs JSON file.
- Every file must exist and be readable. Cordy checks this before opening the browser, even with `--dry-run`.
- A key cannot be both a value (`--input`) and a file (`--file`).
- File inputs are found even when they are hidden behind a styled button or drop zone.
- Jev only learns that a key is a file input. It never receives paths, file names, sizes, or contents, and `--verbose` shows the key as `id_document (file)`.
- Cordy blocks the upload (`needs_review`) when the target is not a file input, when a file does not match the input's `accept` list, or when several files go to an input without `multiple`.
- Generated code declares the same relative paths in a `files` constant and uploads them with `setInputFiles`.

Not supported yet: file inputs that only appear after clicking a button (the file-chooser pattern), and drop zones without a file input.

## Dynamic inputs

Inputs can contain safe templates that Cordy resolves once when each execution starts. Arbitrary JavaScript is not evaluated: `eval`, `process` access, imports, and expressions outside the allowlist are not permitted.

Examples:

```bash
npx cordy \
  "Complete the registration" \
  --start-url https://example.test \
  --input email='email+${timestamp()}@example.com' \
  --input name='${faker.name}' \
  --input reference='days ${randInt(10, 99)}'
```

Supported expressions:

| Expression | Result |
|---|---|
| `${timestamp()}` | Unix timestamp in milliseconds |
| `${randInt()}` | Random integer between `0` and `2147483647` |
| `${randInt(10, 99)}` | Inclusive random integer in the range |
| `${faker.name}` | Generated full name |
| `${faker.email}` | Generated email address |
| `${faker.firstName}` | Generated first name |
| `${faker.lastName}` | Generated last name |
| `${faker.phone}` | Generated phone number |

Templates are resolved in memory and the resulting values are still never sent to Jev. An unsupported expression fails before the browser is executed.

Generated files created with `--output` preserve the declared input source:

- with `--input key=value`, `const input` contains the original template in the generated code and evaluates it at the beginning of every execution;
- with `--input ./inputs.json`, `const input` reads the JSON file and evaluates its templates at the beginning of every execution.

Fields with sensitive names such as `password`, `token`, `secret`, or `api_key` remain references to environment variables so credentials are not embedded in generated code.

Example of running a generated test from a file:

```bash
env \
  email='email+${timestamp()}@example.com' \
  name='${faker.name}' \
  npx playwright test ./playwright/registration.spec.ts
```

`task.txt` can contain a longer instruction:

```text
Get a shipping quote by entering the quote section, fill in the provided values, and verify the expected result.
```

Run it:

```bash
npx cordy \
  --prompt-file ./task.txt \
  --input ./inputs.json \
  --start-url https://example.test \
  --output ./playwright/flow.spec.ts
```

Do not combine a positional instruction with `--prompt-file`.

## Expectations and assertions

Cordy accepts explicit expectations or can infer them from the prompt when they are stated unambiguously.

### Expectations inferred from the prompt

Cordy infers one kind of expectation from a Spanish prompt: a button named after `botón` (or `boton`), optionally followed by `con texto` or `de`. This prompt declares a button:

```text
Simula el envío, llena el formulario y al simular debe mostrar el resumen del envío y un botón de guardar cotización.
```

(The prompt is Spanish because that is the phrasing Cordy parses.) Cordy proposes:

```text
visible button: guardar cotización
```

The generated test contains an assertion equivalent to:

```tsx
await expect(
  page
    .getByRole("button", { name: new RegExp("guardar cotización", "i") })
    .filter({ visible: true })
    .first(),
).toBeVisible();
```

The button expectation preserves the `button` role; it is not converted into a generic `getByText`. Matching is case-insensitive and allows presentation variations such as `Guardar Cotización`, `GUARDAR COTIZACIÓN`, or a visual suffix.

Visible texts, such as `resumen del envío`, are not inferred. Declare them with `--expect 'text:Resumen del envío'`. Cordy must not invent expectations for vague phrases such as `make sure everything works`. If a condition is not explicit or cannot be mapped to an observable check, no automatic assertion is generated.

### Explicit expectations

Declare expectations with the repeatable `--expect '[not-]<kind>:<arg>'` flag. Cordy splits the spec at the first `:`, so arguments such as URLs keep their own colons.

| Kind | Argument | Passes when |
|---|---|---|
| `text` | `<m>` | a visible element's text matches |
| `button` | `<m>` | a visible button's accessible name matches |
| `button-enabled` / `button-disabled` | `<m>` | a button whose name matches is enabled / disabled |
| `url` | `<m>` | the page URL matches |
| `title` | `<m>` | the page title matches |
| `value` | `<label>=<m>` | the form control with that label has a matching value (split at the first `=`) |
| `checked` / `unchecked` | `<label>` | the control with that label is checked / unchecked |
| `count` | `<m>=<n>` | exactly `<n>` elements have matching text (split at the last `=`) |

Prefix any kind except `count` with `not-` to require the opposite, for example `not-text:required field`.

Every matcher `<m>` follows one rule:

- plain text matches as a case-insensitive substring, with characters such as `(` or `.` taken literally;
- `/pattern/flags` is a regular expression (flags `i`, `m`, `s`, `u`);
- `${input.<key>}` inserts the resolved value of a provided `--input`, so you can check that the result echoes what was submitted.

```bash
npx cordy \
  "Complete the flow" \
  --start-url https://example.test \
  --input amount=10000 \
  --expect 'text:Application summary' \
  --expect 'text:${input.amount}' \
  --expect 'value:Monthly payment=/^\$?1,250\.00$/' \
  --expect 'button-enabled:Continue' \
  --expect 'not-text:/error|required/i' \
  --expect 'url:/\/result$/'
```

**Always use single quotes.** In double quotes the shell expands `$` and `${...}` before Cordy sees them. An argument that ends up empty is rejected.

Invalid specs (unknown kind, missing `=`, invalid regex, or a reference to an input that was not provided) fail with exit code `1` before the browser opens.

How expectations are checked:

- They are checked when the flow ends. Each one retries for up to 5 seconds, like Playwright's `expect`, so results that render late still pass.
- Negated expectations run after all positive ones. When every expectation is negated, the result includes a warning, because the run may have passed before the page reached its final state.
- The JSON result lists each expectation with `spec` (as written, with `${input.<key>}` unresolved), `kind`, `negated`, `expected`, and `status`. Failures include `actual`, the observed value, which is redacted for password-like fields.
- A failed expectation makes Cordy return exit code `1`.
- Expectations are never sent to Jev.

The older flags remain as aliases:

```bash
--expect-visible "Shipment summary"         # same as --expect 'text:Shipment summary'
--expect-button "Save quote"                # same as --expect 'button:Save quote'
--expect-url "https://example.test/result"  # the URL must be exactly equal
```

## Generate a test or an automation

### Playwright test with assertions

`test` is the default output type:

```bash
npx cordy \
  "Get a shipping quote and show the Save quote button as the expected result" \
  --start-url https://example.test \
  --input peso=2 \
  --input codigo_postal=44100 \
  --output ./playwright/shipping-quote.spec.ts \
  --output-kind test
```

The output imports `@playwright/test`, creates a `test(...)`, replays successful actions, and adds the `expect(...)` assertions.

### Automation script

Use `automation` when you want a plain script instead of a Playwright test:

```bash
npx cordy \
  "Complete the flow" \
  --start-url https://example.test \
  --input email=ana@example.com \
  --output ./playwright/flow.ts \
  --output-kind automation
```

The output uses Playwright directly. When there are expectations, it also imports `expect` from `@playwright/test` and throws on the first one that does not hold, so `@playwright/test` must be installed to run it.

`--output` is optional. Without it, Cordy does not write an automation file.

### Several named tests in one file

Use `--test-name <slug>` to keep several Cordy tests in the same spec file. The slug uses lowercase letters, digits, and single hyphens (at most 64 characters). It also becomes the test title, so `npx playwright test -g <slug>` runs it. Named tests only work with `--output-kind test`.

```bash
npx cordy "Get a shipping quote" --start-url https://example.test \
  --output ./playwright/flows.spec.ts --test-name cotizar-envio
```

Cordy wraps the test in marker comments and leaves everything outside them untouched:

```ts
// cordy:begin cotizar-envio
test('cotizar-envio', async ({ page }) => {
  // ...
});
// cordy:end cotizar-envio
```

- Without `--update`, the block is appended to the end of the file (created if missing). If a test with that slug already exists, Cordy fails and suggests `--update`.
- With `--update`, Cordy replaces the existing block in place. If the slug does not exist, it fails.
- Shared imports are merged into the file header without duplicates.
- Conflicts and damaged markers (a missing `cordy:end`, nested blocks, duplicate slugs) are reported before the browser opens, and the file is never written.
- If any action or expectation fails, the file is left unchanged, so a failed update never overwrites a working test.

Regenerate one test with a new instruction:

```bash
npx cordy "Get a shipping quote with the new form" --start-url https://example.test \
  --output ./playwright/flows.spec.ts --test-name cotizar-envio --update
```

Add `--diff` to run the flow and print the unified diff instead of writing the file. `--diff` works with or without `--test-name` and cannot be combined with `--dry-run`.

List the Cordy-managed tests in a file to find their slugs:

```bash
npx cordy tests ./playwright/flows.spec.ts
# SLUG           LINES  STATUS
# cotizar-envio  4-20   ok
# login          22-35  ok
```

`cordy tests` never opens a browser. It supports `--json` and exits with code `1` when it finds damaged markers or the file does not exist.

## Dry run, execution, and step limits

Plan without interacting with the site:

```bash
npx cordy \
  "Complete the flow" \
  --start-url https://example.test \
  --input email=ana@example.com \
  --dry-run \
  --json
```

Limit the number of decisions:

```bash
--max-steps 10
```

The allowed value is between `1` and `100`; the default is `20`.

`--dry-run` never writes the `--output` file. With `--test-name`, it prints a preview instead: the import changes as a diff, and whether the test would be appended or replaced (with its current lines). Insert/update conflicts are still reported. Earlier versions wrote a nearly empty file during a dry run.

High-impact clicks (a `submit` step, or a control whose name looks like a submission such as `Simular`, `Enviar`, or `Confirmar`) run only with `--approve`. Without it, the click is recorded as `blocked` with `requires --approve`, and nothing is clicked. **Breaking change:** earlier versions ignored `--approve` and always executed the final click, so add `--approve` to existing commands that must complete the flow. Prompt runs stop right after the high-impact click; plan runs continue with their remaining steps. The action must still pass local validation of the role, locator, and page state.

## JSON output and exit codes

For script integration:

```bash
npx cordy \
  "Complete the flow" \
  --start-url https://example.test \
  --json > result.json
```

The result includes fields such as:

```json
{
  "task": "Complete the flow",
  "startUrl": "https://example.test",
  "actions": [
    {
      "status": "succeeded"
    }
  ],
  "expectations": [
    {
      "kind": "button",
      "expected": "Save quote",
      "status": "passed"
    }
  ]
}
```

Exit codes:

- `0`: actions and expectations completed.
- `1`: an action failed, an action was blocked, an expectation failed, or a configuration/execution error occurred.

## Safe diagnostics

Add `--verbose`:

```bash
npx cordy \
  "Complete the flow" \
  --start-url https://example.test \
  --input email=ana@example.com \
  --verbose
```

Diagnostics are written to `stderr`, so `stdout` can continue to contain clean JSON when using `--json`.

Diagnostics may show:

- Jev endpoint and model;
- observation identifier;
- URL without query string or fragment;
- input names;
- candidate and question counts;
- HTTP status;
- typed responses and token usage;
- selected action and local result.

Diagnostics must never show:

- API keys or `Authorization` headers;
- real input values;
- passwords, cookies, or tokens;
- complete HTML or complete page text.

## Plan files

A prompt is parsed with Spanish phrasing rules that only cover a few flows. For any language or app, write the steps yourself in a plan file and pass it with `--plan` (or `--plan -` to read it from stdin):

```yaml
version: 1
description: Register a new account   # optional; sent to Jev, so no real values
steps:
  - da clic en la sección "Regístrate"
  - espera a que cargue
  - llena el formulario
  - submit: Crear cuenta
```

(The step texts are Spanish to show that any language works; `Regístrate` and `Crear cuenta` are the app's own labels.)

```bash
npx cordy --plan ./plan.yaml \
  --start-url https://example.test \
  --input name=Ana --input email=ana@example.com \
  --expect 'text:Welcome' \
  --approve
```

A plan replaces the prompt; you cannot pass both.

### Step forms

- **Natural language:** one instruction per step, in any language, up to 300 characters. Before the browser opens, Jev classifies each one as `click`, `fill`, `wait`, or `submit`. A step that describes more than one action (`fill the form and click send`) is rejected; split it.
- **Explicit:** `{ click: <text> }`, `{ submit: <text> }`, `{ fill: [key, ...] }`, or `{ wait: load }`. Jev does not classify these.

A plan has at most 50 steps. Values never go in the plan: pass them with `--input` and `--file`. Cordy warns when a step text looks like it contains one (an e-mail address or four or more digits), because step texts are sent to Jev.

### How steps run

- Steps run strictly in order, and Cordy decides locally when each one is complete.
- **click / submit:** the control Jev picks must be named in the step. Its visible name has to appear in the step text as whole words, ignoring accents, case, and punctuation. Put the name in quotes (`clic en "Enviar"`) to require an exact match. Explicit targets use the same matching as prompt targets.
- **fill:** a natural-language fill consumes the pending inputs that have a field on the current screen, so a wizard can have one fill step per screen. The step ends when Jev finds no more matching fields. An explicit `fill` ends when its listed keys are used. If any provided input is still unused when the plan ends, the run fails.
- **wait:** always waits for the page load event. Durations such as "3 seconds" are ignored, and generated code never sleeps for a fixed time.
- **submit:** always high impact. A click is also high impact when the control's name looks like a submission (`submit`, `enviar`, `confirmar`, …), whatever the step says. High-impact clicks need `--approve`.
- Unlike prompt runs, a plan run continues after a high-impact click until its last step.

The JSON result lists `planSteps`: each step's text, kind, whether Jev classified it, whether it was completed, and the target or input keys it used. If the step limit is reached first, or inputs are left unused, the result has `errors` and the exit code is `1`.

### Plan commands

```bash
npx cordy plan init [plan.yaml]   # write a commented example (never overwrites)
npx cordy plan schema             # print the JSON Schema, e.g. for LLM structured output
npx cordy plan check plan.yaml    # validate offline, without Jev or a browser
```

Validation errors name the location, for example `steps[2].fill: expected a list of input keys`, so an agent can fix the plan from the message.

## Ordered execution plan

Cordy creates an in-memory plan before running the browser. The plan extracts the explicit order from the prompt locally—for example, navigate to a section, fill inputs, click `Simulate`, and validate the result—and Jev only resolves the concrete candidate on the current screen for the current step.

The runtime does not allow steps to be skipped. If the prompt requests the `shipping quote` section but the page only exposes `Track a package`, Cordy blocks the action because of the mismatch instead of navigating to a different section. The plan appears in `--json` output.

### Prompt planning is generic

The prompt planner only derives generic steps: navigation to a named section, filling the provided inputs, and the final `simular` click. Earlier versions also contained rules for one specific application. If you relied on them, migrate like this:

- **Extra entry click:** a prompt that asked to simulate a credit used to add a click on a fixed button label before filling the form. Name that click in a plan file instead (`- clic en "<button text>"`).
- **Inferred result text:** one fixed result heading used to become a visible-text expectation. Declare result texts with `--expect 'text:<text>'`. Only the `botón …` phrasing is still inferred.
- **Fill proposed on a button:** Cordy used to turn it into a navigation click on an entry button. It now returns `needs_review`, like any other action that does not fit the control. Use a plan step that names the button.

## Supported actions and limits

Jev can only propose structured actions from this set:

- `goto`;
- `fill`;
- `select`;
- `check`;
- `click`;
- `wait`;
- `needs_review`.

Jev does not execute JavaScript, does not write Playwright code, and does not receive real input values. Playwright executes an action only after local validation against the controls observed on the current page.

Cordy blocks, among other cases:

- `fill` on a button;
- missing or ambiguous targets;
- controls that no longer match the observation;
- inputs that were not provided;
- invalid starting URLs;
- proposals incompatible with the element's accessible role.

## CI integration

Example of a reproducible installation:

```bash
npm ci
npx playwright install --with-deps chromium
```

Configure `JEV_API_KEY` through the CI provider's secret store, not through a commit or a variable written to logs. Run headless and preserve JSON as an artifact:

```bash
npx cordy \
  --prompt-file ./tasks/simulation.txt \
  --input ./tasks/simulation.inputs.json \
  --start-url https://staging.example.test \
  --headless \
  --output ./artifacts/simulation.spec.ts \
  --output-kind test \
  --json > ./artifacts/simulation.result.json
```

Review the JSON file and exit code before publishing results.

## Development from the repository

```bash
git clone <repository-url>
cd cordy
npm ci
npx playwright install chromium
npm run format:check
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

Available commands:

```bash
npm run format
npm run format:check
npm run typecheck
npm test
npm run test:watch
npm run build
npm run lint
npm pack --dry-run
```

## Publishing the package

Publishing is an external operation and must be performed with an authorized npm account:

```bash
npm login
npm whoami
npm run format:check
npm run typecheck
npm test
npm run build
npm pack --dry-run
npm publish
```

Before publishing a new version:

1. update the version with `npm version`;
2. review `npm pack --dry-run`;
3. confirm that `.env`, credentials, private fixtures, and temporary files are not included;
4. verify that `dist`, `README.md`, and `LICENSE` are included;
5. publish from an environment where the npm credential is configured securely.

## Programmatic API

The package also exports the main TypeScript API:

```ts
import { generateTypeScript, runCordy } from '@nac13k/cordy';
```

The `cordy` command is the recommended interface for end users. The programmatic API may change while the package remains in version `0.x`.

## License

MIT
