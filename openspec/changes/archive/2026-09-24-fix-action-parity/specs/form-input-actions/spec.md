## Purpose

Defines how Cordy's input-consuming browser actions resolve input values, when an input counts as consumed by the flow, and how the live run and generated code stay consistent.

## ADDED Requirements

### Requirement: Boolean input interpretation
A `check` action SHALL set the target checked when its input value is `true` and unchecked when it is `false`, compared case-insensitively after trimming. Any other value MUST fail the action with an error naming the input key and the accepted values. Generated code (test and automation output) MUST apply the same interpretation.

#### Scenario: False string unchecks in both places
- **WHEN** a flow runs `check` with input `accept=false`
- **THEN** the live run leaves the checkbox unchecked
- **AND** the generated code sets the checkbox unchecked when run with the same input

#### Scenario: Case-insensitive true
- **WHEN** a flow runs `check` with input `accept=TRUE`
- **THEN** the checkbox is checked

#### Scenario: Invalid boolean value
- **WHEN** a flow runs `check` with input `accept=yes`
- **THEN** the action is recorded as `failed` with an error naming `accept` and the accepted values `true` and `false`
- **AND** the run exits with code 1

### Requirement: Missing input values fail the action
A `fill`, `select`, or `check` action whose input key has no provided value SHALL be recorded as `failed` with the error `missing input: <key>`.

#### Scenario: Select with unknown key
- **WHEN** Jev proposes `select` with an input key that was not provided
- **THEN** the action is recorded as `failed` with `missing input: <key>`

### Requirement: Input consumption by any input action
An input key SHALL count as consumed once any succeeded `fill`, `select`, or `check` action used it. The `fill_inputs` workflow step MUST complete when all its keys are consumed, regardless of which of these actions consumed them. Consumption MUST be computed from the full action history of the run.

#### Scenario: Select completes the fill step
- **WHEN** a plan has a `fill_inputs` step with keys `state` and `amount`, `state` is consumed by a succeeded `select`, and `amount` by a succeeded `fill`
- **THEN** the `fill_inputs` step is complete and the run advances to the next step

#### Scenario: Many inputs
- **WHEN** a flow provides seven inputs and all seven are consumed by succeeded actions
- **THEN** Jev is told that all provided inputs are filled, even though more than five actions have run
