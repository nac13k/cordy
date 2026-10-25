---
schema: omoi/v1
title: Cordy — natural-language Playwright automation with a local control layer
source: local-agent-mode-omoi
problem: 'Writing and maintaining Playwright flows by hand is slow and brittle, while letting an AI agent drive the browser directly is unsafe: it can click the wrong thing, skip steps, leak input values, or trigger irreversible actions.'
users:
  - QA engineers and developers who automate web test flows
  - Coding agents that need to drive a browser through a safe CLI
scope:
  - CLI and programmatic API that run a prompt or plan file as an ordered list of steps
  - Jev proposes structured actions only; Cordy validates them locally and Playwright executes them
  - Typed inputs, file uploads, and dynamic templates (timestamp, randInt, faker)
  - Explicit --expect assertions checked live at the end of a run
  - Generation of @playwright/test specs or automation scripts, including named managed test blocks
  - Agent skill, CI usage, and npm publishing
out_of_scope:
  - Executing arbitrary JavaScript or Playwright code proposed by Jev
  - Inferring expectations from the prompt
  - Production or irreversible operations without independent authorization
  - File-chooser uploads and drop zones without a file input
acceptance:
  - id: AC1
    text: A prompt or plan file runs as ordered steps that cannot be skipped; a target mismatch ends in needs_review instead of navigating elsewhere
  - id: AC2
    text: Jev never receives input values, API keys, cookies, full HTML, or full page text, and can only choose from the allowed actions
  - id: AC3
    text: High-impact clicks and submits run only with --approve
  - id: AC4
    text: --expect assertions are verified live, and any failed action or expectation makes the exit code 1
  - id: AC5
    text: --output generates a runnable @playwright/test spec or automation script that re-evaluates templates on every run and reads secrets from environment variables
  - id: AC6
    text: --json keeps stdout clean JSON and --verbose diagnostics stay redacted
---

## Summary

Cordy is a TypeScript CLI and library that runs Playwright browser flows from natural-language instructions. An external reasoning service, Jev, only proposes structured decisions; Cordy validates them locally and Playwright executes them.

## Execution flow

1. Load the prompt or plan file and split it into ordered steps.
2. Observe the visible controls on the page (never their values).
3. Ask Jev for the structured decision for the current step only.
4. Validate the proposed action, locator, and role locally.
5. Let Playwright execute the allowed interaction.
6. Check the explicit result expectations.
7. Optionally generate a TypeScript test or automation script.

## Name

Cordy combines **coordination** and **Cordyceps**: an external agent suggests what should happen, while Cordy remains the local control layer that validates, constrains, and coordinates what is actually executed.
