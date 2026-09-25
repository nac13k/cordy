## MODIFIED Requirements

### Requirement: Target anchoring for natural-language steps
For a natural-language `click` or `submit` step, Cordy SHALL accept Jev's chosen element only when it is anchored in the step text. Text is normalized by removing diacritics, lowercasing, turning every non-alphanumeric run into a single space, and trimming. If the step text contains quoted text (straight or typographic double quotes), the element's normalized accessible name MUST equal the normalized quoted text. Otherwise, the element's normalized name MUST be at least two characters long and appear in the normalized step text as a whole-word sequence. An element that is not anchored MUST produce `needs_review`. Explicit `click`/`submit` steps SHALL keep the existing target-matching rule.

For a natural-language `fill` step whose text contains quoted text, Cordy SHALL accept a fill, select, check, or upload only on an element whose normalized accessible name equals the normalized text of one of the quotes in the step. The check SHALL apply to the element Cordy would act on, after any local correction of Jev's chosen field. What happens to an element that is not anchored is defined in "Step completion rules". Natural-language `fill` steps without quoted text SHALL NOT be anchored.

#### Scenario: Unquoted anchor
- **WHEN** the step is `da clic en seccion registrate` and Jev chooses an element named `Regístrate`
- **THEN** the element is accepted

#### Scenario: Not anchored
- **WHEN** the step is `da clic en seccion registrate` and Jev chooses an element named `Iniciar sesión`
- **THEN** Cordy returns `needs_review`

#### Scenario: Quoted anchor is exact
- **WHEN** the step is `clic en "Enviar"` and Jev chooses an element named `Enviar solicitud`
- **THEN** Cordy returns `needs_review`

#### Scenario: Quoted fill anchor
- **WHEN** the fill step is `llena "Correo electrónico"` and Jev chooses the textbox named `Correo electronico` with input `email`
- **THEN** Cordy fills that textbox with `email`

#### Scenario: Several quoted fields in one fill step
- **WHEN** the fill step is `llena "Nombre completo" y "Correo electrónico"`
- **THEN** Cordy accepts fills on the textboxes named `Nombre completo` and `Correo electrónico`, and no other field

#### Scenario: Unquoted fill step is not anchored
- **WHEN** the fill step is `llena el formulario` and Jev chooses any visible textbox with a pending input
- **THEN** Cordy fills it

### Requirement: Step completion rules
Cordy SHALL decide step completion locally:
- `click`: one succeeded, anchored click.
- `submit`: one succeeded, anchored, high-impact click.
- explicit `fill: [keys]`: every listed key is consumed.
- natural-language `fill`: Jev is offered only the pending input keys. The step completes when no pending keys remain, or when Jev answers with no input key after at least one key was consumed in this step. If Jev answers with no input key before any key was consumed in this step, Cordy MUST return `needs_review`.
- natural-language `fill` with quoted text: in addition, when Jev chooses an element that is not anchored in the step, the step completes without acting on that element if at least one key was consumed in this step. If no key was consumed in this step yet, Cordy MUST return `needs_review` with the reason `Field "<element name>" is not named in the step "<step text>"`.
- `wait`: Cordy waits for the page load event without contacting Jev. Durations written in the step text are ignored.

#### Scenario: Wizard across two screens
- **WHEN** inputs `name`, `email`, and `id_document` are provided, the plan has `llena el formulario`, `clic en siguiente`, `llena el formulario`, and the first screen only has name and email fields
- **THEN** the first fill step completes after `name` and `email` are consumed and Jev answers with no input key
- **AND** the second fill step consumes `id_document`

#### Scenario: One quoted fill step per field
- **WHEN** inputs `name` and `email` are provided, the steps are `Llena "Nombre completo"`, `llena "Correo electrónico"`, `da click en "Crear cuenta"`, and after filling `Nombre completo` Jev chooses `Correo electrónico` while step 1 is still current
- **THEN** step 1 completes without filling `Correo electrónico`
- **AND** step 2 fills `Correo electrónico` with `email`
- **AND** step 3 clicks `Crear cuenta`

#### Scenario: Unnamed field before any fill
- **WHEN** the current step is `llena "Correo electrónico"`, no key was consumed in it, and Jev chooses the textbox `Nombre completo`
- **THEN** Cordy returns `needs_review` with the reason `Field "Nombre completo" is not named in the step "llena "Correo electrónico""`
- **AND** nothing is filled

#### Scenario: Wait ignores duration
- **WHEN** a step `espera carga 3 segundos` is classified as `wait`
- **THEN** Cordy waits for the page load event and never sleeps for a fixed time
- **AND** generated code for that step waits for the load state, not a timeout
