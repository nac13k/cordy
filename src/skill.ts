import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { version as packageVersion } from '../package.json';

/** Skills directories per agent, relative to the project root or the home directory. */
export const AGENT_SKILL_DIRS = {
  claude: { project: '.claude/skills', global: '.claude/skills' },
  codex: { project: '.agents/skills', global: '.agents/skills' },
  hermes: { project: '.hermes/skills', global: '.hermes/skills' },
  openclaw: { project: 'skills', global: '.openclaw/skills' },
  pi: { project: '.pi/skills', global: '.pi/agent/skills' },
} as const;

export type SkillAgent = keyof typeof AGENT_SKILL_DIRS;

export const SKILL_AGENTS = Object.keys(AGENT_SKILL_DIRS) as SkillAgent[];

const SKILL_FILE = join('cordy', 'SKILL.md');
const SUPPORTED = `supported agents: ${[...SKILL_AGENTS, 'all'].join(', ')}`;
export const SKILL_USAGE =
  'usage: cordy skill install --agent <names> [--global] [--force] | skill print | skill prompt [--agent <name>] [--global]';

/** The Cordy agent skill in the Agent Skills SKILL.md format. */
export function skillMarkdown(version: string = packageVersion) {
  return `---
name: cordy
description: Run browser flows on a website from natural-language steps with the Cordy CLI (Playwright coordinated by Jev), check the result with explicit expectations, and generate Playwright tests or automation scripts. Use when asked to automate, test, or reproduce a form or click-through flow on a URL, or to create or update a Cordy-managed Playwright test.
metadata:
  version: "${version}"
---

# Cordy

Cordy turns a list of natural-language steps into a Playwright browser run. An external reasoning service, Jev, proposes each action. Cordy validates it locally, and Playwright executes it. Full reference: \`npx @nac13k/cordy --help\` and https://github.com/nac13k/cordy#readme.

## Before you run

- Run Cordy with \`npx @nac13k/cordy\`. Never use \`npx cordy\`: the unscoped \`cordy\` package is an unrelated project. Cordy needs Node.js >= 20 and, once per machine, \`npx playwright install chromium\`.
- The Jev API key comes only from the environment variable named in the Cordy config (default \`JEV_API_KEY\`). Never pass it as an argument, write it in a prompt or config file, or print it. If it is missing, ask the user to set it.
- Every run needs an absolute \`--start-url\` (for example \`https://example.test/signup\`), unless the config sets \`start_url\`.

## Write the prompt as steps

The prompt is a list of steps, one action each. Cordy splits it on line breaks, list markers (\`-\`, \`*\`, \`1.\`, \`1)\`), inline numbering (\`1. a 2. b\`), and commas or semicolons outside double quotes. Put exact control names in double quotes. Any language works.

\`\`\`bash
npx @nac13k/cordy 'Open "Sign up", fill in the form, click "Create account"' --start-url https://example.test --input email=ana@example.com
\`\`\`

Check the split offline, without a browser or Jev, before a real run:

\`\`\`bash
npx @nac13k/cordy plan from-prompt 'Open "Sign up", fill in the form, click "Create account"'
\`\`\`

For longer flows, write a plan file: \`cordy plan init plan.yaml\`, validate it with \`cordy plan check plan.yaml\`, and run it with \`--plan plan.yaml\`.

## Pass values as inputs

Never write values in the step text. Jev only sees input names, never values.

- \`--input key=value\` (repeatable) or \`--input ./inputs.json\` for form values.
- \`--file key=path[,path]\` for uploads, with paths relative to the current directory.
- Dynamic values use allowlisted templates in single quotes, for example \`--input 'email=qa+\${timestamp()}@example.test'\`, \`\${randInt(10, 99)}\`, or \`\${faker.name}\`.
- Every input must be used by the flow, or the run fails.

## Recommended workflow

1. Check the step split with \`plan from-prompt\`.
2. Preview without touching the site: add \`--dry-run --json\`.
3. Run for real with \`--json\` and \`--expect\` checks for the final state.
4. When the run succeeds, generate a test with \`--output\`.

\`\`\`bash
npx @nac13k/cordy 'Open "Contact", fill in the form, click "Send"' \\
  --start-url https://example.test \\
  --input email=ana@example.com --input message='Hello' \\
  --expect 'text:Thanks for your message' \\
  --json
\`\`\`

Add \`--headed\` to show the browser and \`--max-steps <n>\` (1 to 100, default 20) to limit actions. \`--verbose\` writes redacted diagnostics to stderr, so stdout stays clean JSON.

## Approval of high-impact actions

A click is high impact when its step is a \`submit\` step or the control name contains words such as Send, Submit, Confirm, Continue, Pay, Buy, Order, Apply, Delete, or Remove. Without \`--approve\` the click is recorded as \`blocked\` and nothing is clicked.

Add \`--approve\` only when the user has explicitly authorized that action on that site, because it can send data, place orders, or delete things. Never add it just to make a run pass. When a run stops at a blocked click, report it and ask the user.

## Expectations

Cordy never infers checks from the prompt. Declare them with the repeatable \`--expect '[not-]<kind>:<arg>'\`, always in single quotes. Kinds: \`text\`, \`button\`, \`button-enabled\`, \`button-disabled\`, \`url\`, \`title\`, \`value\` (\`<label>=<m>\`), \`checked\`, \`unchecked\`, \`count\` (\`<m>=<n>\`). A matcher \`<m>\` is plain text (case-insensitive substring), \`/regex/flags\`, or \`\${input.<key>}\`.

## Read the result

With \`--json\`, stdout is one JSON document:

- \`actions[]\` with \`status\` \`succeeded\`, \`failed\`, \`blocked\`, \`planned\`, or \`approved\`;
- \`expectations[]\` with \`status\` \`passed\`, \`failed\`, or \`planned\` (dry run);
- \`errors\` when a step was not completed or an input was not used, and \`warnings\`;
- \`planSteps\`, the steps Cordy executed.

Exit code \`1\` means an action failed, an expectation failed, the result has \`errors\`, or the configuration was invalid. A blocked action stops the run but does not set exit code \`1\` by itself, so check that every action is \`succeeded\` before you report success.

## Generate tests

- \`--output ./tests/flow.spec.ts\` writes a \`@playwright/test\` spec from the succeeded actions and expectations. \`--output-kind automation\` writes a plain script instead.
- \`--test-name <slug>\` keeps several Cordy tests in one file inside \`// cordy:begin <slug>\` and \`// cordy:end <slug>\` markers. Add \`--update\` to replace an existing block, and \`--diff\` to print the change instead of writing it.
- \`npx @nac13k/cordy tests <file>\` lists the managed tests in a file.
- A failed run leaves the output file unchanged and says why.

## Rules

- Never put secrets or real values in the prompt. Use \`--input\`, and let the user provide secrets through the environment.
- Never add \`--approve\` without the user's explicit consent for that action.
- Do not edit code inside \`cordy:begin\`/\`cordy:end\` markers by hand. Regenerate it with \`--test-name <slug> --update\`.
- Report blocked or \`needs_review\` actions to the user instead of rewording steps to get around them.
`;
}

/** Target path of the skill file for one agent. */
export function skillPath(agent: SkillAgent, global: boolean, cwd: string, home: string) {
  const dirs = AGENT_SKILL_DIRS[agent];
  return global ? join(home, dirs.global, SKILL_FILE) : join(cwd, dirs.project, SKILL_FILE);
}

/** Resolves agent names (comma-separated or repeated, or `all`) or throws listing the supported ones. */
export function parseSkillAgents(values: string[]): SkillAgent[] {
  const names = values.flatMap((value) => value.split(',')).map((name) => name.trim());
  if (!names.some(Boolean)) throw new Error(`--agent is required; ${SUPPORTED}`);
  const unknown = names.filter((name) => name !== 'all' && !(name in AGENT_SKILL_DIRS));
  if (unknown.length) throw new Error(`unsupported agent: ${unknown.join(', ')}; ${SUPPORTED}`);
  if (names.includes('all')) return [...SKILL_AGENTS];
  return [...new Set(names as SkillAgent[])];
}

export interface SkillInstallResult {
  agent: SkillAgent;
  path: string;
  written: boolean;
}

/** Writes the skill for each agent; an existing file is kept unless `force`. */
export async function installSkill(options: {
  agents: SkillAgent[];
  global?: boolean;
  force?: boolean;
  cwd?: string;
  home?: string;
}): Promise<SkillInstallResult[]> {
  const content = skillMarkdown();
  const results: SkillInstallResult[] = [];
  for (const agent of options.agents) {
    const path = skillPath(
      agent,
      Boolean(options.global),
      options.cwd ?? process.cwd(),
      options.home ?? homedir(),
    );
    await mkdir(dirname(path), { recursive: true });
    try {
      await writeFile(path, content, { encoding: 'utf8', flag: options.force ? 'w' : 'wx' });
      results.push({ agent, path, written: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      results.push({ agent, path, written: false });
    }
  }
  return results;
}

export const SKILL_BEGIN = '<<<CORDY_SKILL_BEGIN>>>';
export const SKILL_END = '<<<CORDY_SKILL_END>>>';

/** A prompt asking a coding agent to save the skill file itself. */
export function skillPrompt(options: { agent?: SkillAgent; global?: boolean } = {}) {
  const target = options.agent
    ? options.global
      ? `~/${AGENT_SKILL_DIRS[options.agent].global}/cordy/SKILL.md`
      : `${AGENT_SKILL_DIRS[options.agent].project}/cordy/SKILL.md`
    : undefined;
  const where = target
    ? `Save it at \`${target}\`${options.global ? '' : ' in the project root'}.`
    : options.global
      ? 'Save it as `cordy/SKILL.md` in your user-level skills directory.'
      : 'Save it as `cordy/SKILL.md` in your project skills directory.';
  return `Install the Cordy agent skill so you know how to use the Cordy CLI (npx @nac13k/cordy) for browser automation.

Create a file with exactly the content between the ${SKILL_BEGIN} and ${SKILL_END} lines, without those two lines. ${where} Create missing directories. Do not change the content. If the file already exists, ask me before replacing it. When you are done, tell me the path you wrote.

${SKILL_BEGIN}
${skillMarkdown()}${SKILL_END}
`;
}

function parseSkillArgs(args: string[]) {
  const agents: string[] = [];
  let global = false;
  let force = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--agent') {
      const value = args[++index];
      if (value === undefined || value.startsWith('-')) throw new Error('--agent needs a value');
      agents.push(value);
    } else if (arg.startsWith('--agent=')) agents.push(arg.slice('--agent='.length));
    else if (arg === '--global') global = true;
    else if (arg === '--force') force = true;
    else throw new Error(`unknown argument: ${arg}\n${SKILL_USAGE}`);
  }
  return { agents, global, force };
}

/** `cordy skill install|print|prompt`. */
export async function skillCommand(args: string[]) {
  const [command, ...rest] = args;
  try {
    if (command === 'print') {
      if (rest.length) throw new Error(SKILL_USAGE);
      process.stdout.write(skillMarkdown());
      return 0;
    }
    if (command === 'prompt') {
      const { agents, global, force } = parseSkillArgs(rest);
      if (force) throw new Error(`--force only applies to skill install\n${SKILL_USAGE}`);
      const parsed = agents.length ? parseSkillAgents(agents) : [];
      if (parsed.length > 1 || agents.some((value) => value.split(',').includes('all')))
        throw new Error('skill prompt takes a single --agent');
      process.stdout.write(skillPrompt({ agent: parsed[0], global }));
      return 0;
    }
    if (command === 'install') {
      const options = parseSkillArgs(rest);
      const results = await installSkill({ ...options, agents: parseSkillAgents(options.agents) });
      for (const result of results) {
        if (result.written) console.log(`Skill installed for ${result.agent}: ${result.path}`);
        else console.error(`${result.path} already exists; rerun with --force to replace it`);
      }
      return results.every((result) => result.written) ? 0 : 1;
    }
    throw new Error(SKILL_USAGE);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
