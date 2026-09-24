## REMOVED Requirements

### Requirement: Generic prompt-derived steps
**Reason**: The Spanish regex planner is replaced by splitting the prompt into natural-language steps that Jev classifies, which works in any language.
**Migration**: Write the steps as a list, for example `Entra a la sección "cotizador de envíos", llena el formulario, simula con "Simular"`, or use a plan file. Run `cordy plan from-prompt` to see the split.

### Requirement: Generic expectation inference
**Reason**: Inference only recognized Spanish `botón …` phrasing and mixed steps with assertions in one text.
**Migration**: Declare the expectation explicitly with `--expect 'button:<name>'`.
