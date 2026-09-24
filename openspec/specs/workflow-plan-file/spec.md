# workflow-plan-file Specification

## Purpose
Defines a language- and domain-independent plan file that people or LLM agents write to tell Cordy which steps a flow must follow, and the tooling to create, describe, and validate it.

## Requirements

### Requirement: Plan flag
The CLI SHALL accept `--plan <path>`, and `--plan -` SHALL read the plan from stdin. `--plan` MUST be rejected when combined with a positional instruction or `--prompt-file`. When a plan is given, its `description` (or, if absent, the concatenated step texts) SHALL be the task sent to Jev.

#### Scenario: Plan from stdin
- **WHEN** the user pipes a plan into `cordy --plan - --start-url https://example.test`
- **THEN** Cordy loads the plan from stdin

#### Scenario: Plan with prompt
- **WHEN** the user passes both a positional instruction and `--plan plan.yaml`
- **THEN** Cordy exits with code 1, saying the two are mutually exclusive

### Requirement: Plan file format
A plan file SHALL be YAML (JSON documents are accepted as YAML) with `version: 1`, an optional `description` string, and a non-empty `steps` list of at most 50 entries. Each step SHALL be one of:
- a non-empty natural-language string of at most 300 characters, in any language,
- `click: <target>` or `submit: <target>`, where the target is a non-empty string,
- `fill: [<key>, ...]` with at least one input key, or
- `wait: load`.

Objects with more than one key, unknown keys, or wrong value types MUST be rejected.

#### Scenario: Mixed plan
- **WHEN** the plan's steps are `da clic en la sección "Regístrate"`, `espera a que cargue`, `llena el formulario`, and `{ submit: Enviar }`
- **THEN** the plan is accepted with three natural-language steps and one explicit submit step

#### Scenario: Unknown step key
- **WHEN** a step is `{ press: Enter }`
- **THEN** the plan is rejected

### Requirement: Actionable validation errors
Plan validation errors SHALL be reported with exit code 1 before the browser launches or Jev is contacted. Each error MUST include the location in the plan (for example `steps[2]`) and state what was expected, so that an LLM agent can correct the plan from the message alone.

#### Scenario: Error location
- **WHEN** the third step is `{ fill: "amount" }` (a string instead of a list)
- **THEN** the error names `steps[2].fill` and says a list of input keys is expected

### Requirement: Plan subcommands
Cordy SHALL provide:
- `cordy plan init [<path>]`, which writes a commented example plan (default path `plan.yaml`) and refuses to overwrite an existing file;
- `cordy plan schema`, which prints the plan file's JSON Schema to stdout; and
- `cordy plan check <path|->`, which validates the plan's structure without launching a browser or contacting Jev, exiting 0 when valid and 1 with the validation errors otherwise.

#### Scenario: Init refuses overwrite
- **WHEN** `plan.yaml` exists and the user runs `cordy plan init`
- **THEN** Cordy exits with code 1 and leaves the file unchanged

#### Scenario: Schema is valid JSON
- **WHEN** the user runs `cordy plan schema`
- **THEN** stdout is a single JSON Schema document that accepts the example written by `plan init`

#### Scenario: Offline check
- **WHEN** the user runs `cordy plan check plan.yaml` with no Jev API key configured
- **THEN** Cordy validates the structure and exits without contacting Jev
