## Purpose

Keeps prompt-derived runs inside Cordy's plan: a run ends when its derived steps are complete, an incomplete run fails visibly, and clicks on submission-like controls always need approval, whatever the language of their names.

## ADDED Requirements

### Requirement: Prompt runs end when their steps are complete
Without `--plan`, Cordy SHALL stop asking Jev for actions as soon as every step derived from the prompt is complete, and then evaluate the expectations. Cordy MUST NOT request or execute any action that is not part of a derived step.

#### Scenario: Fill-only prompt
- **WHEN** the prompt `llena el formulario` runs with input `peso=2` and the fill succeeds
- **THEN** the run records only the fill action and makes no further Jev request

#### Scenario: English prompt with inputs
- **WHEN** the prompt `Go to the shipping quote section, fill in the form, and click Simulate.` runs with input `peso=2`
- **THEN** only the fill step is derived, and the run ends after the fill without clicking `Simulate`

#### Scenario: Full Spanish flow
- **WHEN** the prompt `Entra a la sección cotizador de envíos, llena el formulario y simula.` runs with input `peso=2` and `--approve`
- **THEN** the run executes the navigation click, the fill, and the final `simular` click, and then stops

### Requirement: Incomplete prompt runs fail
When a prompt run reaches the step limit before its derived steps are complete, and the run is not a dry run, the result SHALL include an error naming the first incomplete step, and the exit code MUST be 1. In managed output mode nothing is written.

#### Scenario: Step limit before the final click
- **WHEN** a prompt derives a fill step and a final click, and `--max-steps 1` ends the run after the fill
- **THEN** the result has an error naming the final click step as not completed, and the exit code is 1

### Requirement: High-impact control names
A click SHALL be high impact when its step is a submit or final-impact step, or when the clicked control's name contains, case-insensitively, one of: `submit`, `enviar`, `simular`, `continuar`, `confirmar`, `calcular`, `solicitar`, `simulate`, `calculate`, `send`, `confirm`, `continue`, `request`, `apply`, `pay`, `purchase`, `buy`, `order`, `delete`, `remove`. A high-impact click MUST require `--approve` in both prompt and plan mode.

#### Scenario: English submission button
- **WHEN** a plan step `clic en "Simulate"` is classified as `click` and Jev picks a button named `Simulate`
- **THEN** the click is high impact and is recorded as `blocked` with `requires --approve` when `--approve` is absent

#### Scenario: Case-insensitive match
- **WHEN** Jev picks a button named `PLACE ORDER` for a click step
- **THEN** the click is high impact
