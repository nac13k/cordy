## REMOVED Requirements

### Requirement: Regex planner fallback
**Reason**: The regex planner is removed. Without `--plan`, the prompt is split into steps (see `prompt-step-lists`).
**Migration**: None. A prompt that the regex planner could not handle now runs as a list of steps.
