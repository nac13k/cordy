## Purpose

Defines what Cordy derives from a Spanish natural-language prompt when no plan file is given, and guarantees that the derived steps and inferred expectations never depend on labels of one specific application.

## ADDED Requirements

### Requirement: Generic prompt-derived steps
Without `--plan`, Cordy SHALL derive at most these steps from the prompt, in this order:
- a section-navigation step when the prompt says `entra`, `entrando`, `navega`, `navegando`, or `ve` followed by `a la sección <name>`, targeting `<name>`;
- a fill step with every provided input key, when inputs are provided;
- a final high-impact click targeting `simular` when the prompt contains `simula`, `simular`, `calcula`, or `calcular`;
- an assert step when expectations exist.

Cordy MUST NOT add any other step, and MUST NOT target a hard-coded application label.

#### Scenario: Simulation prompt without extra entry click
- **WHEN** the prompt is `entra a la sección cotizador de envíos y simula un envío llenando el formulario` with inputs `peso` and `codigo_postal`
- **THEN** the steps are section navigation to `cotizador de envíos`, a fill step with `peso` and `codigo_postal`, and a final click targeting `simular`, with no other click step

#### Scenario: Credit wording adds no step
- **WHEN** the prompt is `simula un crédito llenando el formulario` with input `monto`
- **THEN** the steps are a fill step with `monto` and a final click targeting `simular`

### Requirement: Generic expectation inference
Cordy SHALL infer a button expectation from the prompt only when it contains `botón` (or `boton`), optionally followed by `con texto` or `de`, and then the button name, up to ` y `, a comma, a period, or the end. Cordy MUST NOT infer visible-text expectations from fixed result headings. Visible-text results SHALL be declared explicitly with `--expect 'text:<matcher>'`.

#### Scenario: Button phrase is inferred
- **WHEN** the prompt ends with `debe mostrar el resumen del envío y un botón de guardar cotización`
- **THEN** the inferred expectations are exactly one button expectation named `guardar cotización`

#### Scenario: No text inferred from a result heading
- **WHEN** the prompt says `debe mostrar una pantalla con los datos del resultado solicitado`
- **THEN** no visible-text expectation is inferred
