## Context

Inputs are a flat `Record<string, string>` from the CLI to `execute`. `observePage` keeps only visible elements and derives roles from the tag name, so file inputs appear as `textbox` or are dropped. Jev receives `{ available: true, type: 'provided_input' }` per key and chooses from a fixed action list. `jev.ts` also re-matches `fill` proposals to text fields by key-name heuristics.

## Goals / Non-Goals

**Goals:**
- Upload through a real `<input type="file">`, whether visible or hidden.
- Keep Jev's action vocabulary and privacy boundary unchanged.
- Shape the input model so that later typed inputs (dates) fit without a redesign.

**Non-Goals:**
- The file-chooser pattern (input created on click): Jev would have to target a button, which needs a separate validation rule.
- Drop zones with no file input, synthetic file generation, and upload progress or completion assertions.

## Decisions

### A typed input model alongside the existing string record
```ts
type ProvidedInputs = {
  values: Record<string, string>;        // today's record, unchanged semantics
  files: Record<string, string[]>;       // key → paths relative to cwd
};
```
`values` still flows through `resolveInputRecord` (templates are resolved once per run). `files` is never templated. Alternative considered: one `Record<string, InputValue>` union. Rejected for this change, because it would ripple through every `inputs[key]` string use. A later date change can move to a union once there are more types.

### `--file` is its own flag
A `@path` prefix on `--input` would collide with real values that start with `@` (handles, e-mail local parts). A separate flag is unambiguous for agents and humans alike.

### Jev keeps choosing `fill`; Cordy maps it to `upload`
The request metadata becomes `{ available: true, type: 'file' | 'provided_input' }`. After Jev answers, Cordy checks the key type against the target's role and produces `PlannedAction { kind: 'upload', locator, inputKey }`. `upload` is added to the `PlannedAction` union but never offered to Jev, so the invariant "Jev can only choose from goto/fill/select/check/click/wait/needs_review" holds. The key-name re-matching heuristic in `jev.ts` skips file keys, and file elements are excluded from its text-field candidates.

### Observing hidden file inputs
`observePage` adds `input[type=file]` to the selector and exempts it from the visibility filter. The role becomes `file`, and new optional fields `accept` and `multiple` are collected. The name falls back through `aria-label` → associated `<label>` → `name` → `id` → the nearest ancestor's short text (trimmed to 80 characters), so Jev has something to match against. `valueState` uses `files.length > 0`, not `value` (which holds `C:\fakepath\…`).

### Accept checking uses extension and a small MIME map
`accept` tokens are either extensions (`.pdf`) or MIME types (`image/*`, `application/pdf`). Cordy maps the file extension to a MIME type with a small built-in table (pdf, png, jpg/jpeg, gif, webp, csv, txt, doc/docx, xls/xlsx, zip) and supports `type/*` wildcards. It does not inspect file contents. An unknown extension only matches an explicit extension token.

### Generated code inlines relative paths
The generated file declares `const files = { "id_document": ["./fixtures/id.pdf"] };` next to `input`, and uploads with `setInputFiles(files["id_document"])`. Paths are relative and non-secret, so inlining is safe. It also keeps the generated code readable when inputs come from a JSON file. `resolveInputRecord` skips typed file entries, so generated code that reads the inputs JSON does not fail on them. Playwright resolves relative paths against the process cwd, which matches the "run from project root" convention.

## Risks / Trade-offs

- [Hidden file inputs with no label give Jev a weak name] → The ancestor-text fallback helps. When Jev picks the wrong one, the result is `needs_review` or an upload to the wrong field, which a `--expect` assertion (for example, the file name shown in the form) catches.
- [An inlined path in generated code diverges if the inputs JSON later points elsewhere] → Documented. The JSON is still the source for the live run.
- [Pages that listen only to drop events never see `setInputFiles`] → Out of scope. The run fails visibly (the form stays incomplete) rather than silently.
- [The extension-based MIME check can be fooled by a mislabeled file] → Acceptable. It is a guard against obvious mistakes, not a security boundary.
