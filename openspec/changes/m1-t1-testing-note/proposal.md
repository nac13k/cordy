## Why

Contributors have no short, dedicated note on how to run Cordy's tests; the commands are only in `CLAUDE.md`. Milestone `m1-pr-test` (acceptance AC1) asks for a short docs note that explains it.

## What Changes

- Add `docs/testing.md`: two or three sentences on running the test suite with `npm test`.
- Change nothing else (task `t1-testing-note` owns only `docs/testing.md`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a docs-only change with no spec-level behavior, so `.openspec.yaml` sets `skip_specs: true`.

## Impact

- New file `docs/testing.md`. No code, config, tests, or other docs change.
