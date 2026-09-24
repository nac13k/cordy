## Context

`src/app.ts:main` dispatches subcommands by hand before flag parsing (`init`, `tests`, `plan`). `plan init` already refuses to overwrite with `flag: 'wx'`. The package is bundled by tsup into `dist/cli.js`, and the published `files` list is `dist`, `README.md`, `LICENSE`, `docs`. Requirements are in `specs/agent-skill/spec.md`; motivation is in `proposal.md`.

## Goals / Non-Goals

**Goals:**
- One source of skill text, bundled into the build, shared by `install`, `print`, and `prompt`.
- A small, data-driven agent path table so adding an agent is a one-line change.
- Testable without touching the real home directory.

**Non-Goals:**
- Updating or uninstalling skills, detecting which agents are installed, or merging with a user-edited `SKILL.md`.
- Installing Cordy itself or Playwright browsers.
- Agent-specific frontmatter variants (every target gets the same Agent Skills file).

## Decisions

**Skill text lives in `src/skill.ts` as a template string.** The build bundles it, so there is no runtime file lookup relative to `dist/` and no change to `package.json#files`. Alternative considered: a `skills/cordy/SKILL.md` file in the package read at runtime. It is nicer to edit and could be used by `npx skills add`, but it needs path resolution from the bundle and a `files` entry. The template string wins for simplicity; it can be moved later without changing behavior.

**Version comes from `package.json` at build time.** Import it with `import pkg from '../package.json' with { type: 'json' }` (tsup/esbuild inlines only the used field under tree-shaking; if the whole object is inlined, that is acceptable at this size). Alternative: a hand-written constant, which drifts. If `resolveJsonModule`/import attributes cause friction with `tsc`, fall back to a tsup `define` of `__CORDY_VERSION__` with a `declare const` for typecheck.

**Agent path table.** `AGENT_SKILL_DIRS: Record<Agent, { project: string; global: string }>` with the values in the spec. Sources for the defaults:
- `claude`: Claude Code reads `.claude/skills/` and `~/.claude/skills/`.
- `codex`: Codex reads `.agents/skills/` in the repo and `~/.agents/skills/` for the user. This repo's own OpenSpec Codex target already writes `.agents/skills/`.
- `hermes`: `.hermes/skills/` in the project (matches this repo) and `~/.hermes/skills/`.
- `openclaw`: workspace `skills/` and managed `~/.openclaw/skills/`. The project path is the bare `skills/` folder because OpenClaw treats the workspace root as the project; the risk is noted below.
- `pi`: `.pi/skills/` and `~/.pi/agent/skills/`.
These are assumptions based on each tool's current conventions and are the one place to fix if a tool changes.

**Pure functions plus a thin CLI.** `skillMarkdown()`, `skillPrompt({ agent?, global? })`, and `installSkill({ agents, global, force, cwd, home })` return data or results; `skillCommand(args)` in `app.ts` (or `skill.ts`) parses args and prints. `cwd` and `home` default to `process.cwd()` and `os.homedir()` and are injected in tests with temp directories.

**Argument parsing by hand**, like `plan` and `tests`: `--agent` repeatable and comma-separated, `--global`, `--force`. Unknown flags are a usage error. Validation of all agent names happens before any write, so an invalid list writes nothing.

**Overwrite protection per file.** Write with `flag: force ? 'w' : 'wx'`; on `EEXIST`, report and continue, then exit `1`. This keeps `plan init`'s behavior and still installs the other agents.

**Prompt format.** A short instruction paragraph, the target path (or "your project skills directory"), then the document between `<<<CORDY_SKILL_BEGIN>>>` and `<<<CORDY_SKILL_END>>>` lines, and a final line asking the agent not to change the content and to confirm the saved path. Delimiters that do not appear in Markdown avoid confusion with the code fences inside the skill.

**Skill body scope.** Written for an agent: when to use Cordy, prerequisites, a minimal safe workflow (`plan from-prompt` → `--dry-run --json` → live run → `--output`), inputs and files, expectations, reading the JSON result and exit codes, managed tests, and hard rules (no secrets in prompts or args, `--approve` only with explicit user consent, never edit generated `cordy:begin/end` markers by hand). It links to the README for full flag reference rather than copying it, to keep it short.

## Risks / Trade-offs

- [An agent's skills directory convention changes] → Paths are in one table and covered by a table-driven test; `skill prompt` and `skill print` still work for any agent.
- [OpenClaw's project path `skills/` is generic and may collide with an unrelated folder] → Only written when the user explicitly picks `openclaw`; existing files are never overwritten without `--force`.
- [Skill text drifts from real CLI behavior] → Tests assert the skill mentions each flag it documents and that every documented flag appears in `help`.
- [JSON import of `package.json` breaks typecheck or bundling] → Fallback to a tsup `define` described above.
