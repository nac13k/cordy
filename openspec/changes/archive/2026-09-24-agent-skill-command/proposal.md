## Why

Coding agents (Claude Code, Codex, Hermes, OpenClaw, pi) can drive Cordy from a shell, but they have to learn its flags, safety rules, and result format from the README every time. A bundled agent skill teaches them how to use Cordy correctly: prompts as step lists, inputs instead of secrets in the prompt, `--dry-run` and `plan from-prompt` before a live run, `--json` results, and never adding `--approve` without the user's consent. Cordy should ship that skill and install it for the agent the user picks.

## What Changes

- New `cordy skill` command group:
  - `cordy skill install --agent <name>[,<name>...] [--global] [--force]` writes `cordy/SKILL.md` into each chosen agent's skills directory. Supported agents: `claude`, `codex`, `hermes`, `openclaw`, `pi`, plus `all`. The default scope is the current project; `--global` writes under the user's home directory. An existing file is left alone unless `--force` is given.
  - `cordy skill print` writes the raw `SKILL.md` to stdout.
  - `cordy skill prompt [--agent <name>]` writes a ready-to-paste prompt that asks an agent to create the skill file itself, with the full skill content embedded. With `--agent`, the prompt names that agent's project skill path.
- The skill content is a single source in the package (English, versioned with the package), so `install`, `print`, and `prompt` always emit the same text.
- `--help`, README, and `docs/USAGE.md` document the new command.
- No change to runs, Jev requests, or existing commands. No network access and no Jev call.

## Capabilities

### New Capabilities
- `agent-skill`: The `cordy skill` command group: the bundled skill content, per-agent install paths and scopes, overwrite protection, and the `print` and `prompt` outputs.

### Modified Capabilities
<!-- None: existing run, plan, and managed-test behavior is unchanged. -->

## Impact

- New `src/skill.ts` (skill content, agent path table, install/print/prompt), dispatched from `src/app.ts:main` like `plan` and `tests`; `help` text gains the command.
- New `test/skill.test.ts` using a temporary directory for both the project root and the home directory.
- README and `docs/USAGE.md` gain a short "Use Cordy from an agent" section.
- No new dependencies. Writes only the chosen `SKILL.md` files.
