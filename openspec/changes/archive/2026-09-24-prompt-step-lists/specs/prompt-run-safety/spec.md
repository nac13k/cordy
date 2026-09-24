## REMOVED Requirements

### Requirement: Prompt runs end when their steps are complete
**Reason**: Prompt runs now use plan semantics. Cordy never asks Jev for actions outside a step, and the run ends after the last split step.
**Migration**: None. The prompt's steps are now exactly the listed steps, so a run no longer stops early after a high-impact click.

### Requirement: Incomplete prompt runs fail
**Reason**: Covered by the plan step completion rules, which now apply to prompt runs.
**Migration**: None. Incomplete steps still make the exit code 1.
