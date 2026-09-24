## Purpose

Lets coding agents learn how to use Cordy safely by installing, printing, or requesting a bundled `SKILL.md` through the `cordy skill` command group.

## ADDED Requirements

### Requirement: Bundled skill content
Cordy SHALL ship one skill document in English, in the Agent Skills `SKILL.md` format: YAML frontmatter with `name: cordy`, a `description` that tells an agent when to use Cordy, and `metadata.version` equal to the installed Cordy package version, followed by a Markdown body. The body SHALL cover at least:
- running Cordy with `npx @nac13k/cordy` and the requirement of `--start-url`;
- the Jev API key coming only from the environment variable named in config (default `JEV_API_KEY`), never as a CLI argument or in the prompt;
- writing the prompt as a list of steps, and checking the split offline with `cordy plan from-prompt`;
- passing values through `--input`/`--file` instead of writing them in the prompt;
- using `--dry-run` before a live run and `--json` to read the result, and that exit code `1` means a failed action or expectation;
- adding `--approve` only when the user has explicitly authorized the high-impact action;
- `--expect` assertions and generating tests with `--output`, `--test-name`, and `--update`.

`cordy skill install`, `cordy skill print`, and `cordy skill prompt` SHALL emit this same document byte for byte.

#### Scenario: Version in the frontmatter
- **WHEN** Cordy version `0.3.0` runs `cordy skill print`
- **THEN** stdout starts with a `---` frontmatter block containing `name: cordy` and `version: "0.3.0"` under `metadata`

#### Scenario: Same content everywhere
- **WHEN** the user runs `cordy skill print` and `cordy skill install --agent claude`
- **THEN** the installed file content equals the printed content

### Requirement: Install the skill for chosen agents
`cordy skill install` SHALL require `--agent` with one or more agent names, given as a comma-separated list, as repeated flags, or as `all` for every supported agent. For each chosen agent it SHALL write `cordy/SKILL.md` under that agent's skills directory, creating missing directories:

| Agent | Project (default) | `--global` |
|---|---|---|
| `claude` | `.claude/skills/` | `~/.claude/skills/` |
| `codex` | `.agents/skills/` | `~/.agents/skills/` |
| `hermes` | `.hermes/skills/` | `~/.hermes/skills/` |
| `openclaw` | `skills/` | `~/.openclaw/skills/` |
| `pi` | `.pi/skills/` | `~/.pi/agent/skills/` |

Project paths SHALL be relative to the current working directory and `~` SHALL be the user's home directory. For each written file Cordy SHALL print `Skill installed for <agent>: <path>` and exit `0` when every file was written.

#### Scenario: Project install for Claude Code
- **WHEN** the user runs `cordy skill install --agent claude` in `/work/app`
- **THEN** Cordy writes `/work/app/.claude/skills/cordy/SKILL.md`
- **AND** prints `Skill installed for claude: /work/app/.claude/skills/cordy/SKILL.md`

#### Scenario: Several agents at once
- **WHEN** the user runs `cordy skill install --agent codex,pi`
- **THEN** Cordy writes `.agents/skills/cordy/SKILL.md` and `.pi/skills/cordy/SKILL.md` in the current directory

#### Scenario: Global install
- **WHEN** the user runs `cordy skill install --agent hermes --global`
- **THEN** Cordy writes `~/.hermes/skills/cordy/SKILL.md` and nothing under the current directory

#### Scenario: All agents
- **WHEN** the user runs `cordy skill install --agent all`
- **THEN** Cordy writes the skill for `claude`, `codex`, `hermes`, `openclaw`, and `pi`

### Requirement: Invalid install requests
`cordy skill install` SHALL exit `1` without writing any file when `--agent` is missing or names an unsupported agent. The error SHALL list the supported agents.

#### Scenario: Missing agent
- **WHEN** the user runs `cordy skill install`
- **THEN** Cordy exits `1` and prints a usage error listing `claude, codex, hermes, openclaw, pi, all`

#### Scenario: Unknown agent among valid ones
- **WHEN** the user runs `cordy skill install --agent claude,cursor`
- **THEN** Cordy exits `1`, names `cursor` as unsupported, and writes no file, not even for `claude`

### Requirement: Existing skill files are protected
When a target `SKILL.md` already exists, `cordy skill install` SHALL leave it unchanged, print `<path> already exists; rerun with --force to replace it`, continue with the remaining agents, and exit `1`. With `--force` it SHALL replace the file.

#### Scenario: Existing file without force
- **WHEN** `.claude/skills/cordy/SKILL.md` exists and the user runs `cordy skill install --agent claude,codex`
- **THEN** the Claude file is unchanged, the Codex file is written, and Cordy exits `1`

#### Scenario: Replace with force
- **WHEN** `.claude/skills/cordy/SKILL.md` exists and the user runs `cordy skill install --agent claude --force`
- **THEN** the file contains the current skill content and Cordy exits `0`

### Requirement: Print the skill
`cordy skill print` SHALL write the skill document to stdout with nothing else on stdout, write no file, and exit `0`.

#### Scenario: Redirect to a file
- **WHEN** the user runs `cordy skill print > SKILL.md`
- **THEN** `SKILL.md` contains exactly the skill document

### Requirement: Print an install prompt for an agent
`cordy skill prompt` SHALL write to stdout, and nowhere else, a prompt in English addressed to a coding agent. The prompt SHALL ask the agent to save the embedded content unchanged as `cordy/SKILL.md` in its skills directory, and SHALL contain the full skill document between clearly marked delimiters. Without `--agent`, the prompt SHALL tell the agent to use its own project skills directory. With `--agent <name>` (one supported agent, not `all`), the prompt SHALL name that agent's project path from the install table, and with `--global` its global path. An unsupported agent SHALL exit `1` without output on stdout. The command SHALL exit `0` otherwise.

#### Scenario: Generic prompt
- **WHEN** the user runs `cordy skill prompt`
- **THEN** stdout contains the instruction to save the content as `cordy/SKILL.md` in the agent's skills directory
- **AND** the full skill document between the delimiters

#### Scenario: Prompt for a named agent
- **WHEN** the user runs `cordy skill prompt --agent codex`
- **THEN** the prompt tells the agent to save the file at `.agents/skills/cordy/SKILL.md`

### Requirement: Skill commands stay local
The `cordy skill` commands SHALL NOT contact Jev or any network service, SHALL NOT launch a browser, SHALL NOT require `JEV_API_KEY`, and SHALL NOT read or write Cordy configuration files.

#### Scenario: No API key
- **WHEN** `JEV_API_KEY` is unset and the user runs `cordy skill install --agent claude`
- **THEN** the skill is installed and Cordy exits `0`
