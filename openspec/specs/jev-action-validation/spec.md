# jev-action-validation Specification

## Purpose
Defines how Cordy treats a Jev proposal whose action does not fit the chosen control, so that validation stays generic and never rewrites a proposal based on one application's labels.

## Requirements

### Requirement: Incompatible fill proposals are not rewritten
When Jev proposes `fill`, `select`, or `check` on a control whose role cannot take that action (for example a button), Cordy SHALL return `needs_review` naming the proposed action and the role. Cordy MUST NOT turn the proposal into a click on another control, whatever the prompt text or the control names are.

#### Scenario: Fill proposed on a button
- **WHEN** the prompt is `entra a la sección cotizador de envíos` and Jev proposes `fill` with an input key on a button named `Cotizar ahora`
- **THEN** Cordy returns `needs_review` with a reason naming `fill` and `role=button`
- **AND** no click action is produced

#### Scenario: Selector-based entry buttons get no special treatment
- **WHEN** a button carries a `data-event` attribute and Jev proposes `fill` on it
- **THEN** Cordy returns `needs_review`

### Requirement: Key-name retargeting stays available
When Jev proposes `fill` with a value input key on a control that cannot be filled, Cordy SHALL still retarget the proposal to the single visible text field whose locator matches every word of the key longer than two characters, as it does today. This correction depends only on the input key name, not on the prompt or on application labels.

#### Scenario: Fill retargeted by key name
- **WHEN** Jev proposes `fill` with key `codigo_postal` on a button, and exactly one visible text field has a locator containing `codigo` and `postal`
- **THEN** Cordy returns a `fill` action for `codigo_postal` on that text field
