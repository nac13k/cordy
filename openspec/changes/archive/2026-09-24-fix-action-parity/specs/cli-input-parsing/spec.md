## Purpose

Defines how the `--input` CLI flag tells an inline `key=value` input apart from a path to a JSON inputs file.

## ADDED Requirements

### Requirement: Inline input takes precedence over file detection
An `--input` argument SHALL be parsed as an inline `key=value` pair when the text before its first `=` is a valid input key (a letter or underscore followed by letters, digits, `_`, `.`, or `-`). Otherwise the argument SHALL be treated as a path to a JSON inputs file. The value part MAY contain any characters, including further `=` signs, and MAY end in `.json` or start with `./` or `/`.

#### Scenario: Value that looks like a path
- **WHEN** the user passes `--input report=./data/report.json`
- **THEN** Cordy records the inline input `report` with value `./data/report.json`
- **AND** does not try to read an inputs file

#### Scenario: Inputs file path
- **WHEN** the user passes `--input ./inputs.json`
- **THEN** Cordy reads `./inputs.json` as the inputs file

#### Scenario: Value containing equals signs
- **WHEN** the user passes `--input query=a=b`
- **THEN** Cordy records the inline input `query` with value `a=b`
