import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import pkg from '../package.json';

const runCordy = vi.fn();
const launch = vi.fn();
vi.mock('../src/run.js', () => ({ runCordy }));
vi.mock('@playwright/test', () => ({ chromium: { launch } }));

const { main, help } = await import('../src/app.js');
const { AGENT_SKILL_DIRS, SKILL_BEGIN, SKILL_END, installSkill, skillMarkdown, skillPrompt } =
  await import('../src/skill.js');

describe('agent skill content', () => {
  it('has Agent Skills frontmatter with the package version', () => {
    const skill = skillMarkdown();
    expect(skill.startsWith('---\nname: cordy\ndescription: ')).toBe(true);
    expect(skill).toContain(`metadata:\n  version: "${pkg.version}"\n---\n`);
    expect(skillMarkdown('0.3.0')).toContain('version: "0.3.0"');
  });

  it('covers the topics an agent needs', () => {
    const skill = skillMarkdown();
    for (const topic of [
      'npx @nac13k/cordy',
      '--start-url',
      'JEV_API_KEY',
      'plan from-prompt',
      '--input',
      '--file',
      '--dry-run',
      '--json',
      '--approve',
      '--expect',
      '--output',
      '--test-name',
      '--update',
    ])
      expect(skill, topic).toContain(topic);
  });

  it('only mentions flags that the CLI help documents', () => {
    const flags = new Set(skillMarkdown().match(/--[a-z][a-z-]*/g));
    for (const flag of flags) expect(help, flag).toContain(flag);
  });
});

describe('cordy skill', () => {
  let cwd: string;
  let home: string;
  let stdout: string[];
  let stderr: string[];
  beforeEach(async () => {
    const root = await mkdtemp(join(tmpdir(), 'cordy-skill-'));
    cwd = join(root, 'project');
    home = join(root, 'home');
    await mkdir(cwd);
    await mkdir(home);
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    vi.stubEnv('HOME', home);
    vi.stubEnv('USERPROFILE', home);
    vi.stubEnv('JEV_API_KEY', undefined);
    stdout = [];
    stderr = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => stdout.push(args.join(' ')));
    vi.spyOn(console, 'error').mockImplementation((...args) => stderr.push(args.join(' ')));
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const expected = {
    claude: ['.claude/skills', '.claude/skills'],
    codex: ['.agents/skills', '.agents/skills'],
    hermes: ['.hermes/skills', '.hermes/skills'],
    openclaw: ['skills', '.openclaw/skills'],
    pi: ['.pi/skills', '.pi/agent/skills'],
  };

  it.each(Object.entries(expected))(
    'installs for %s in the project and home',
    async (agent, dirs) => {
      const [project, global] = dirs;
      expect(await main(['skill', 'install', '--agent', agent])).toBe(0);
      const projectFile = join(cwd, project, 'cordy', 'SKILL.md');
      expect(await readFile(projectFile, 'utf8')).toBe(skillMarkdown());
      expect(stdout).toContain(`Skill installed for ${agent}: ${projectFile}`);

      expect(await main(['skill', 'install', '--agent', agent, '--global'])).toBe(0);
      expect(await readFile(join(home, global, 'cordy', 'SKILL.md'), 'utf8')).toBe(skillMarkdown());
    },
  );

  it('keeps the path table in sync with the documented paths', () => {
    expect(
      Object.fromEntries(
        Object.entries(AGENT_SKILL_DIRS).map(([agent, dirs]) => [
          agent,
          [dirs.project, dirs.global],
        ]),
      ),
    ).toEqual(expected);
  });

  it('writes nothing under the project with --global', async () => {
    expect(await main(['skill', 'install', '--agent', 'hermes', '--global'])).toBe(0);
    expect(await readdir(cwd)).toEqual([]);
  });

  it('accepts comma-separated, repeated, and all agents', async () => {
    expect(await main(['skill', 'install', '--agent', 'codex,pi'])).toBe(0);
    expect(await readdir(cwd)).toEqual(expect.arrayContaining(['.agents', '.pi']));
    const results = await installSkill({ agents: ['claude', 'claude'], cwd, home });
    expect(results).toHaveLength(2);
    expect(await main(['skill', 'install', '--agent', 'all', '--force'])).toBe(0);
    expect(stdout.filter((line) => line.startsWith('Skill installed for'))).toHaveLength(7);
  });

  it('prints the same content it installs', async () => {
    expect(await main(['skill', 'print'])).toBe(0);
    expect(stdout.join('')).toBe(skillMarkdown());
    expect(await readdir(cwd)).toEqual([]);
    stdout.length = 0;
    await main(['skill', 'install', '--agent', 'claude']);
    expect(await readFile(join(cwd, '.claude/skills/cordy/SKILL.md'), 'utf8')).toBe(
      skillMarkdown(),
    );
  });

  it('rejects a missing or unsupported agent without writing', async () => {
    expect(await main(['skill', 'install'])).toBe(1);
    expect(stderr.join('\n')).toContain('claude, codex, hermes, openclaw, pi, all');
    expect(await main(['skill', 'install', '--agent', 'claude,cursor'])).toBe(1);
    expect(stderr.join('\n')).toMatch(/unsupported agent: cursor/);
    expect(await readdir(cwd)).toEqual([]);
  });

  it('rejects unknown subcommands and flags', async () => {
    expect(await main(['skill'])).toBe(1);
    expect(await main(['skill', 'remove'])).toBe(1);
    expect(await main(['skill', 'install', '--agent', 'claude', '--yes'])).toBe(1);
    expect(await main(['skill', 'print', '--agent', 'claude'])).toBe(1);
    expect(await readdir(cwd)).toEqual([]);
  });

  it('keeps an existing file unless --force', async () => {
    const file = join(cwd, '.claude/skills/cordy/SKILL.md');
    await mkdir(join(cwd, '.claude/skills/cordy'), { recursive: true });
    await writeFile(file, 'mine', 'utf8');
    expect(await main(['skill', 'install', '--agent', 'claude,codex'])).toBe(1);
    expect(await readFile(file, 'utf8')).toBe('mine');
    expect(stderr).toContain(`${file} already exists; rerun with --force to replace it`);
    expect(await readFile(join(cwd, '.agents/skills/cordy/SKILL.md'), 'utf8')).toBe(
      skillMarkdown(),
    );
    expect(await main(['skill', 'install', '--agent', 'claude', '--force'])).toBe(0);
    expect(await readFile(file, 'utf8')).toBe(skillMarkdown());
  });

  it('prints a generic install prompt with the full skill', async () => {
    expect(await main(['skill', 'prompt'])).toBe(0);
    const prompt = stdout.join('');
    expect(prompt).toBe(skillPrompt());
    expect(prompt).toContain('Save it as `cordy/SKILL.md` in your project skills directory.');
    const embedded = prompt.slice(
      prompt.indexOf(`${SKILL_BEGIN}\n`) + SKILL_BEGIN.length + 1,
      prompt.indexOf(`${SKILL_END}\n`),
    );
    expect(embedded).toBe(skillMarkdown());
    expect(await readdir(cwd)).toEqual([]);
  });

  it('names the agent path in the prompt', async () => {
    expect(await main(['skill', 'prompt', '--agent', 'codex'])).toBe(0);
    expect(stdout.join('')).toContain('`.agents/skills/cordy/SKILL.md`');
    expect(skillPrompt({ agent: 'pi', global: true })).toContain(
      '`~/.pi/agent/skills/cordy/SKILL.md`',
    );
  });

  it('rejects an unsupported or multiple agents in the prompt', async () => {
    expect(await main(['skill', 'prompt', '--agent', 'cursor'])).toBe(1);
    expect(await main(['skill', 'prompt', '--agent', 'all'])).toBe(1);
    expect(await main(['skill', 'prompt', '--agent', 'claude,codex'])).toBe(1);
    expect(stdout).toEqual([]);
  });

  it('stays local: no API key, config, Jev, or browser', async () => {
    await writeFile(join(cwd, 'cordy.toml'), 'not = [valid', 'utf8');
    expect(await main(['skill', 'install', '--agent', 'claude'])).toBe(0);
    expect(await main(['skill', 'print'])).toBe(0);
    expect(await main(['skill', 'prompt'])).toBe(0);
    expect(runCordy).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
  });

  it('documents the command in --help', async () => {
    await main(['--help']);
    expect(stdout.join('\n')).toMatch(/skill install --agent <names> \[--global\] \[--force\]/);
    expect(stdout.join('\n')).toMatch(/skill print/);
    expect(stdout.join('\n')).toMatch(/skill prompt \[--agent <name>\]/);
  });
});
