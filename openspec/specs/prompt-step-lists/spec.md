# prompt-step-lists Specification

## Purpose
Lets users and agents pass just the steps of a flow as the prompt, in any language, as a list separated by line breaks, list markers, inline numbering, or commas, and run them exactly like the natural-language steps of a plan file.

## Requirements

### Requirement: Prompt splitting
Cordy SHALL split a positional prompt or the contents of `--prompt-file` into ordered steps with these rules, applied in order:
1. Line endings are normalized, the text is split on line breaks, and blank lines are dropped.
2. A leading list marker is removed from each line: `-`, `*`, or `•` followed by whitespace, or a number followed by `.` or `)` and whitespace.
3. When the prompt has a single line that starts with `1.` or `1)`, it is split before each following ` 2.`, ` 3.`, and so on (or ` 2)`, ` 3)`), in sequence. A number that does not continue the sequence does not split.
4. Each piece is split on commas and semicolons that are outside double quotes (`"…"` or `“…”`). A comma between two digits does not split.
5. Each resulting step is trimmed, a trailing period is removed, and empty steps are dropped.

Dashes inside a line, and conjunctions such as `y` or `and`, MUST NOT split steps. A prompt with no separators SHALL be a single step.

#### Scenario: Line breaks with dashes
- **WHEN** the prompt is `- clic en "Registro"\n- llena el formulario\n- envía con "Crear cuenta"`
- **THEN** the steps are `clic en "Registro"`, `llena el formulario`, and `envía con "Crear cuenta"`

#### Scenario: Numbered lines
- **WHEN** the prompt is `1. Open "Pricing"\n2) Fill in the form`
- **THEN** the steps are `Open "Pricing"` and `Fill in the form`

#### Scenario: Inline numbering
- **WHEN** the prompt is `1. clic en "Registro" 2. llena el formulario 3. envía`
- **THEN** the steps are `clic en "Registro"`, `llena el formulario`, and `envía`

#### Scenario: Number outside the sequence
- **WHEN** the prompt is `1. espera 3. llena el formulario`
- **THEN** there is one step, `espera 3. llena el formulario`

#### Scenario: Commas outside quotes
- **WHEN** the prompt is `clic en "Sí, continuar", llena el formulario, envía.`
- **THEN** the steps are `clic en "Sí, continuar"`, `llena el formulario`, and `envía`

#### Scenario: Decimal comma
- **WHEN** the prompt is `espera 1,5 segundos`
- **THEN** there is one step, `espera 1,5 segundos`

#### Scenario: Inline dash does not split
- **WHEN** the prompt is `clic en Sign-up - Free`
- **THEN** there is one step, `clic en Sign-up - Free`

#### Scenario: Single instruction
- **WHEN** the prompt is `Go to the "Pricing" section and click "Buy"`
- **THEN** there is one step with that text

### Requirement: Split limits
The split steps SHALL obey the plan file limits: at most 50 steps and at most 300 characters per step. A prompt that exceeds a limit, or that has no step after splitting, MUST make Cordy exit with code 1 before launching the browser, with a message naming the limit or the empty prompt.

#### Scenario: Too many steps
- **WHEN** the prompt has 51 comma-separated steps
- **THEN** Cordy exits with code 1, saying at most 50 steps are allowed

#### Scenario: Only separators
- **WHEN** the prompt is `, ;`
- **THEN** Cordy exits with code 1, saying the prompt has no steps

### Requirement: Prompt steps run as plan steps
Every split step SHALL be a natural-language plan step. The run SHALL behave as a plan file whose `steps` are the split steps and whose `description` is absent:
- Jev classifies the steps before the browser launches, and a `compound` step is rejected;
- click and submit targets are anchored in the step text;
- the run continues until the last step is complete or an action does not succeed, including after a high-impact click;
- an incomplete step or an unused input makes the exit code 1;
- the task sent to Jev is the prompt text.

#### Scenario: Compound step rejected
- **WHEN** the prompt is `Entra a la sección cotizador de envíos, llena el formulario y simula.`
- **THEN** the steps are `Entra a la sección cotizador de envíos` and `llena el formulario y simula`, Jev classifies the second as `compound`, and Cordy exits with code 1 before launching the browser, asking to split that step

#### Scenario: English list
- **WHEN** the prompt is `Open "Shipping quote", fill in the form, click "Simulate"` with input `peso=2` and `--approve`
- **THEN** the run executes a click on `Shipping quote`, fills `peso`, and clicks `Simulate`

#### Scenario: Continue after a submit
- **WHEN** the prompt is `llena el formulario, envía con "Enviar", clic en "Descargar comprobante"` with `--approve`
- **THEN** the run executes the fill, the submit click, and then the download click

#### Scenario: Unused input
- **WHEN** the prompt is `clic en "Registro"` with input `peso=2`
- **THEN** the run fails with an error naming `peso`

### Requirement: Value warnings for prompt steps
Because the prompt text is sent to Jev, Cordy SHALL add a warning to the run result for every prompt step that contains an e-mail address or a sequence of four or more digits, suggesting that values be passed with `--input` or `--file`. Warnings MUST NOT block the run.

#### Scenario: E-mail in a step
- **WHEN** a prompt step is `llena el correo con ana@example.test`
- **THEN** the result contains a warning naming that step, and the run continues

### Requirement: Plan from prompt subcommand
`cordy plan from-prompt <text>` SHALL print, to stdout, a version 1 plan in YAML whose `steps` are the split steps of `<text>`. `cordy plan from-prompt -` SHALL read the text from stdin. The subcommand MUST NOT contact Jev or launch a browser, and it MUST exit with code 1 when the split fails a limit.

#### Scenario: Printed plan
- **WHEN** the user runs `cordy plan from-prompt 'clic en "Registro", llena el formulario'`
- **THEN** stdout is a YAML plan with `version: 1` and the steps `clic en "Registro"` and `llena el formulario`, and `cordy plan check` accepts it

#### Scenario: Offline
- **WHEN** the user runs `cordy plan from-prompt -` with no Jev API key configured
- **THEN** Cordy prints the plan without contacting Jev
