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

Cordy is published on npm as `@nac13k/cordy`. You do not need to install it globally:

```bash
npx @nac13k/cordy --help
```

To prevent `npx` from unexpectedly selecting a different version, pin the version:

```bash
npx @nac13k/cordy@0.1.0 --help
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

The installed binary is named `cordy`, so inside a project that depends on it `npx cordy` runs the local copy. The `npx cordy ...` examples in the rest of this guide assume a local installation:

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
  --input weight=3500000 \
  --input postal_code=2500000
```

Values are used locally to execute `fill`, `select`, or `check`. Jev receives input names and availability, but never the real values.

### Inputs from JSON

Create `inputs.json`:

```json
{
  "email": "ana@example.com",
  "name": "Ana",
  "weight": "3500000"
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
Get a shipping quote by entering the simulation section, fill in the provided values, and verify the expected result.
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

This prompt declares two expected results:

```text
Get a shipping quote, fill in the form, and after simulation show a screen with the shipment summary and a save quote button.
```

Cordy proposes:

```text
visible text: shipment summary
visible button: save quote
```

The generated test contains assertions equivalent to:

```tsx
await expect(
  page.getByText(new RegExp("shipment summary", "i")).first(),
).toBeVisible();

await expect(
  page.getByRole("button", {
    name: new RegExp("save quote", "i"),
  }),
).toBeVisible();
```

The button expectation preserves the `button` role; it is not converted into a generic `getByText`. Matching is case-insensitive and allows presentation variations such as `Save quote`, `SAVE QUOTE`, or a visual suffix.

Cordy must not invent expectations for vague phrases such as `make sure everything works`. If a condition is not explicit or cannot be mapped to an observable check, no automatic assertion is generated.

### Explicit expectations

Visible text:

```bash
--expect-visible "Shipment summary"
```

Button by accessible name:

```bash
--expect-button "Save quote"
```

URL:

```bash
--expect-url "https://example.test/result"
```

Each option can be repeated:

```bash
npx cordy \
  "Complete the flow" \
  --start-url https://example.test \
  --expect-visible "Application summary" \
  --expect-visible "Monthly amount" \
  --expect-button "Continue" \
  --expect-url "https://example.test/result"
```

Expectations are checked live when the flow ends. A failed expectation makes Cordy return exit code `1`.

## Generate a test or an automation

### Playwright test with assertions

`test` is the default output type:

```bash
npx cordy \
  "Get a shipping quote and show the save quote button as the expected result" \
  --start-url https://example.test \
  --input weight=3500000 \
  --input postal_code=2500000 \
  --output ./playwright/simulation.spec.ts \
  --output-kind test
```

The output imports `@playwright/test`, creates a `test(...)`, replays successful actions, and adds the `expect(...)` assertions.

### Automation without assertions

Use `automation` when you only want the interaction sequence:

```bash
npx cordy \
  "Complete the flow" \
  --start-url https://example.test \
  --input email=ana@example.com \
  --output ./playwright/flow.ts \
  --output-kind automation
```

The output uses Playwright directly and waits for the visibility of explicit expectations without importing `@playwright/test`.

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
# SLUG             LINES  STATUS
# cotizar-envio  4-20   ok
# login            22-35  ok
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

`--approve` is retained for CLI compatibility. Cordy's current behavior treats executions as test flows and permits the final impact click to complete the flow, stopping immediately afterward. The action must still pass local validation of the role, locator, and page state.

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

## Ordered execution plan

Cordy creates an in-memory plan before running the browser. The plan extracts the explicit order from the prompt locally—for example, navigate to a section, fill inputs, click `Simulate`, and validate the result—and Jev only resolves the concrete candidate on the current screen for the current step.

The runtime does not allow steps to be skipped. If the prompt requests `shipping quote` but the page only exposes `Track a package`, Cordy blocks the action because of the mismatch instead of navigating to a different section. The plan appears in `--json` output.

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

Releases are published to npm by the `Publish to npm` GitHub Actions workflow (`.github/workflows/publish.yml`) whenever a `v*` tag is pushed:

```bash
npm version patch   # or minor / major; commits the bump and creates the v* tag
git push --follow-tags
```

The workflow checks that the tag matches the `version` in `package.json`, runs `format:check`, `typecheck`, and `test`, and then runs `npm publish`. Pre-release versions such as `0.2.0-beta.1` are published under the `next` dist-tag, so they do not replace `latest`.

One-time setup: create an npm granular access token with read and write access to `@nac13k/cordy` (or to all packages for the first publish) and store it as the `NPM_TOKEN` repository secret in GitHub.

Before tagging a new version:

1. review `npm pack --dry-run`;
2. confirm that `.env`, credentials, private fixtures, and temporary files are not included;
3. verify that `dist`, `README.md`, and `LICENSE` are included.

## Programmatic API

The package also exports the main TypeScript API:

```ts
import { generateTypeScript, runCordy } from '@nac13k/cordy';
```

The `cordy` command is the recommended interface for end users. The programmatic API may change while the package remains in version `0.x`.

## License

MIT
