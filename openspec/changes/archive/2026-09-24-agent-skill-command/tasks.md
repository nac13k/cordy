## 1. Skill content

- [x] 1.1 Expose the package version to `src/` (JSON import of `package.json`, or a tsup `define` fallback per design.md) and verify `npm run typecheck` and `npm run build` pass
- [x] 1.2 Create `src/skill.ts` with `skillMarkdown()` returning the English `SKILL.md` (frontmatter `name: cordy`, `description`, `metadata.version`; body covering every topic listed in the "Bundled skill content" requirement) and verify a test asserts the frontmatter fields and the presence of `--start-url`, `JEV_API_KEY`, `plan from-prompt`, `--input`, `--file`, `--dry-run`, `--json`, `--approve`, `--expect`, `--output`, `--test-name`, `--update`
- [x] 1.3 Add a test that every `--flag` mentioned in the skill body appears in `app.ts:help`, and verify it passes

## 2. Install, print, prompt

- [x] 2.1 Add the `AGENT_SKILL_DIRS` table (`claude`, `codex`, `hermes`, `openclaw`, `pi`) and `installSkill({ agents, global, force, cwd, home })`, validating all names before any write and using `wx` unless `force`; verify a table-driven test with temp `cwd`/`home` checks every project and global path
- [x] 2.2 Cover overwrite protection: existing file left unchanged with the `--force` hint and exit `1` while other agents still install; `--force` replaces it; verify with tests
- [x] 2.3 Add `skillPrompt({ agent?, global? })` with the `<<<CORDY_SKILL_BEGIN>>>`/`<<<CORDY_SKILL_END>>>` delimiters, generic and per-agent wording; verify tests check the embedded document equals `skillMarkdown()` and the Codex path appears for `--agent codex`

## 3. CLI wiring

- [x] 3.1 Dispatch `cordy skill install|print|prompt` from `app.ts:main` before flag parsing, parsing `--agent` (repeatable, comma-separated, `all`), `--global`, `--force`; unknown subcommand, unknown flag, missing or unsupported agent exit `1` with a usage error listing supported agents; verify with `main([...])` tests in `test/skill.test.ts`
- [x] 3.2 Verify `skill print` and `skill prompt` write only to stdout (no files, no extra lines) and that no skill command touches config, Jev, or the browser (tests with `JEV_API_KEY` unset and the Playwright mock not called)
- [x] 3.3 Add `skill install --agent <names> [--global] [--force] | skill print | skill prompt [--agent <name>]` to the `help` Commands section and verify `cordy --help` output in a test

## 4. Docs and checks

- [x] 4.1 Add a "Use Cordy from an agent" section to README and `docs/USAGE.md` with the path table and examples of all three subcommands; verify the paths match `AGENT_SKILL_DIRS`
- [x] 4.2 Run `npm run format:check`, `npm run typecheck`, `npm test`, `npm run build`, then `node dist/cli.js skill print` and `node dist/cli.js skill install --agent claude` in a scratch directory, and verify the installed file matches the printed output
