# plan-step-execution Specification

## Purpose
Defines how Cordy executes a plan file step by step with Jev: how natural-language steps are interpreted, how Cordy validates Jev's choices without language-specific rules, and when each step and the whole plan are complete.

## Requirements

### Requirement: Step classification
Before any action is executed on the page, Cordy SHALL ask Jev to classify every natural-language step as exactly one of `click`, `fill`, `wait`, `submit`, or `compound`, using `choice` questions. Explicit steps SHALL NOT be classified. Jev MUST receive only the plan description and the step texts for this classification, never input values. If Jev classifies any step as `compound`, does not classify a step, or returns an invalid answer, the run MUST stop with exit code 1 before any page action, naming the step index and text.

#### Scenario: Compound step rejected
- **WHEN** a step is `llena el formulario y da clic en enviar` and Jev classifies it as `compound`
- **THEN** the run stops before any page action with an error naming the step and asking to split it into separate steps

#### Scenario: Explicit steps skip classification
- **WHEN** a plan contains only explicit steps
- **THEN** Cordy makes no classification request

### Requirement: Ordered step cursor
Cordy SHALL execute plan steps strictly in order and keep the current step locally. Jev SHALL be offered only the actions allowed for the current step's kind (`click`/`submit`: click; `fill`: fill, select, check). A step MUST NOT be skipped. The run SHALL end successfully only when every step is complete. If the step limit is reached before that, the run MUST fail, naming the first incomplete step.

#### Scenario: No skipping
- **WHEN** the current step is a `click` step and Jev proposes a `fill`
- **THEN** Cordy returns `needs_review` and the run stops

#### Scenario: Step limit
- **WHEN** `--max-steps 5` is reached while step 3 of 4 is incomplete
- **THEN** the run fails and reports step 3 as incomplete

### Requirement: Target anchoring for natural-language steps
For a natural-language `click` or `submit` step, Cordy SHALL accept Jev's chosen element only when it is anchored in the step text. Text is normalized by removing diacritics, lowercasing, turning every non-alphanumeric run into a single space, and trimming. If the step text contains quoted text (straight or typographic double quotes), the element's normalized accessible name MUST equal the normalized quoted text. Otherwise, the element's normalized name MUST be at least two characters long and appear in the normalized step text as a whole-word sequence. An element that is not anchored MUST produce `needs_review`. Explicit `click`/`submit` steps SHALL keep the existing target-matching rule.

#### Scenario: Unquoted anchor
- **WHEN** the step is `da clic en seccion registrate` and Jev chooses an element named `Regístrate`
- **THEN** the element is accepted

#### Scenario: Not anchored
- **WHEN** the step is `da clic en seccion registrate` and Jev chooses an element named `Iniciar sesión`
- **THEN** Cordy returns `needs_review`

#### Scenario: Quoted anchor is exact
- **WHEN** the step is `clic en "Enviar"` and Jev chooses an element named `Enviar solicitud`
- **THEN** Cordy returns `needs_review`

### Requirement: Step completion rules
Cordy SHALL decide step completion locally:
- `click`: one succeeded, anchored click.
- `submit`: one succeeded, anchored, high-impact click.
- explicit `fill: [keys]`: every listed key is consumed.
- natural-language `fill`: Jev is offered only the pending input keys. The step completes when no pending keys remain, or when Jev answers with no input key after at least one key was consumed in this step. If Jev answers with no input key before any key was consumed in this step, Cordy MUST return `needs_review`.
- `wait`: Cordy waits for the page load event without contacting Jev. Durations written in the step text are ignored.

#### Scenario: Wizard across two screens
- **WHEN** inputs `name`, `email`, and `id_document` are provided, the plan has `llena el formulario`, `clic en siguiente`, `llena el formulario`, and the first screen only has name and email fields
- **THEN** the first fill step completes after `name` and `email` are consumed and Jev answers with no input key
- **AND** the second fill step consumes `id_document`

#### Scenario: Wait ignores duration
- **WHEN** a step `espera carga 3 segundos` is classified as `wait`
- **THEN** Cordy waits for the page load event and never sleeps for a fixed time
- **AND** generated code for that step waits for the load state, not a timeout

### Requirement: All inputs consumed
When all steps are complete, every provided input (values and files) MUST have been consumed. Otherwise the run MUST fail with exit code 1, naming the unconsumed keys, and in managed output mode nothing is written.

#### Scenario: Unused input
- **WHEN** the plan completes and the input `phone` was never consumed
- **THEN** the run fails with an error naming `phone`

### Requirement: High-impact clicks in plan mode
A click SHALL be high impact when its step is a `submit` step or when the element name matches Cordy's existing high-impact rule. High-impact clicks MUST require `--approve` whether the steps come from a plan file or from a prompt. Without it, the click is recorded as `blocked` with the reason `requires --approve` and nothing is clicked. The existing guard against clicking while visible text fields are still empty SHALL apply to them. The run SHALL continue with the following steps after a high-impact click and stop only when the last step is complete or an action does not succeed.

#### Scenario: Plan cannot lower protection
- **WHEN** a natural-language step classified as `click` targets a button named `Enviar`, which matches the high-impact rule
- **THEN** the click requires `--approve`

#### Scenario: Approval required in prompt mode
- **WHEN** the prompt `llena el formulario, envía con "Enviar"` reaches the submit click without `--approve`
- **THEN** the click is recorded as `blocked` with `requires --approve` and is not executed

#### Scenario: Continue after submit
- **WHEN** a plan has a `submit` step followed by `clic en "Descargar comprobante"` and the run has `--approve`
- **THEN** the run executes the submit click and then the following step

### Requirement: Dry-run interpretation
In `--dry-run` with a plan, the result SHALL list every step with its original text or explicit form, its kind (classified or explicit), and, for steps reached during the dry run, the chosen target or consumed keys. `wait` steps SHALL note that any duration is ignored.

#### Scenario: Dry-run listing
- **WHEN** the user runs a four-step plan with `--dry-run`
- **THEN** the result's `plan.steps` has four entries, each with the step text and its kind

### Requirement: Value warnings for step text
Because step text and the plan description are sent to Jev, Cordy SHALL add a warning to the run result for every step or description that contains an e-mail address or a sequence of four or more digits, suggesting that values be passed with `--input` or `--file`. Warnings MUST NOT block the run.

#### Scenario: Digits in step
- **WHEN** a step is `llena monto con 10000`
- **THEN** the result contains a warning naming that step, and the run continues
