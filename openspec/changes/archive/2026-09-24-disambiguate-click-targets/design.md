## Context

- **Candidate choice:** `observe.ts` collects elements with one `evaluateAll` over a fixed selector. It builds candidates in this order: unique selector (`id`/`data-event`), `getByRole(role:name)`, `getByLabel`, `getByPlaceholder`. `jev.ts` uses `locatorCandidates[0]` of the element Jev picked.
- **Matching:** `run.ts:locatorFor` and `locatorExpression` turn a `LocatorSpec` into a Playwright locator or code. `getByRole` name matching is case-insensitive substring by default, so duplicates arise both from repeated names and from names that contain other names.
- **Output decision:** `managed-output.ts:decideOutput` only receives `succeeded: boolean`.

## Goals / Non-Goals

**Goals:**
- A pinned locator acts on exactly the observed element Jev chose.
- Generated tests stay readable (`getByRole(...).nth(n)`, not CSS paths).
- Clickable non-semantic elements reach Jev without flooding the observation.
- The skip message says what to fix.

**Non-Goals:**
- Changing how Jev chooses between duplicates. It already sees each element separately.
- Detecting click handlers added by frameworks through `addEventListener`. `cursor: pointer` is the proxy.
- Changing when unmanaged `--output` is written.

## Decisions

**Compute `nth` with Playwright, not by counting in the page.**
- The observing `evaluateAll` stores the observed nodes in a page-scoped array (`window.__cordyObserved`).
- For each element without a unique selector, Cordy resolves its first candidate with the same `locatorFor` used at execution, and runs `evaluateAll(els => els.map(el => window.__cordyObserved.indexOf(el)))`.
- If there are several matches, the position of the element's own index in that list is `nth`.
- This mirrors Playwright's own matching (accessible names, substring rules, hidden-element filtering), so it cannot drift from execution.
- The array is deleted afterwards. The DOM is not modified.

*Alternative rejected:* counting same-role, same-name elements in the page script, because it diverges from Playwright's accessible-name rules. *Also rejected:* `exact: true`, because it would break names that differ slightly between `innerText` and the accessible name, and would not fix true duplicates.

**Only query locators that can be ambiguous.** Unique selectors are skipped, so a typical page needs one extra query per remaining element, which is cheap next to the Jev round-trip.

**`nth` lives on `LocatorSpec` as an optional non-negative integer.** Candidates carry it into the chosen action. `locatorFor` applies `.nth(n)`, and `locatorExpression` appends `.nth(n)`. Jev does not see `nth`: the candidate text it receives stays `strategy:value`.

**Clickable heuristic runs in the same page script.**
- Pass one collects the semantic selector plus the new roles, `summary`, `a:not([href])`, and `[onclick]`.
- Pass two walks `body *` once, keeps elements whose computed cursor is `pointer` and whose parent's cursor is not, with text of 1–80 characters, and drops any that contain or are inside a pass-one element.
- Role `clickable` gets a `getByText(name)` candidate, with `nth` computed the same way. The name is the first visible line, not the whole `innerText`: `innerText` joins block children with line breaks that `getByText` (which matches normalized `textContent`) does not see, so a multi-line card name would match nothing. A match inside an observed card counts as that card when computing `nth`.
- `jev.ts` allows click on `clickable` and keeps rejecting fill, select, and check on it (the existing role checks already reject roles outside `textbox`/`combobox`/`checkbox`/`radio`).

**Skip reason is computed in `run.ts`.** `decideOutput` gets an optional `reason: string`, and `run.ts` builds it from the records (mapped to steps through `recordSteps`), `errors`, and expectations. The `--approve` hint is appended when the record is a click blocked with `requires --approve`.

## Risks / Trade-offs

- **`nth` depends on page order.** A generated test can break if the page reorders identical controls. Identical controls usually lead to the same place, and the alternative is a strict-mode failure. The README documents this.
- **`cursor: pointer` false positives:** labels, decorative wrappers, and custom checkboxes can be included. *Mitigation:* the text length bound, the outermost-only rule, and the containment filter. Anchoring still requires the element's name to be in the step text.
- **Observation cost:** one `evaluateAll` per ambiguous-candidate element plus a DOM walk. It is bounded by visible elements and acceptable next to the 3-second click settle time.
