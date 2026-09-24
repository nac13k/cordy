## MODIFIED Requirements

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
