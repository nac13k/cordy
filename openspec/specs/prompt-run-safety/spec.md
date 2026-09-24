# prompt-run-safety Specification

## Purpose
Makes clicks on submission-like controls always need approval, whatever the language of their names and whether the steps come from a prompt or a plan file.

## Requirements

### Requirement: High-impact control names
A click SHALL be high impact when its step is a submit or final-impact step, or when the clicked control's name contains, case-insensitively, one of: `submit`, `enviar`, `simular`, `continuar`, `confirmar`, `calcular`, `solicitar`, `simulate`, `calculate`, `send`, `confirm`, `continue`, `request`, `apply`, `pay`, `purchase`, `buy`, `order`, `delete`, `remove`. A high-impact click MUST require `--approve` in both prompt and plan mode.

#### Scenario: English submission button
- **WHEN** a plan step `clic en "Simulate"` is classified as `click` and Jev picks a button named `Simulate`
- **THEN** the click is high impact and is recorded as `blocked` with `requires --approve` when `--approve` is absent

#### Scenario: Case-insensitive match
- **WHEN** Jev picks a button named `PLACE ORDER` for a click step
- **THEN** the click is high impact
