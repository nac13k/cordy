import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseCliArgs } from '../src/cli-options.js';
import { runCordy } from '../src/run.js';

describe('run expectations', () => {
  let startUrl: string;
  const jevRequests: string[] = [];
  beforeAll(async () => {
    const file = join(await mkdtemp(join(tmpdir(), 'cordy-run-')), 'page.html');
    await writeFile(file, '<title>Result</title><p>Summary 10,000</p><button>Continue</button>');
    startUrl = pathToFileURL(file).href;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const run = (...flags: string[]) => {
    vi.stubEnv('JEV_API_KEY', 'test-only');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        jevRequests.push(String(init?.body));
        return new Response(JSON.stringify({ answers: { action: { choice: 'needs_review' } } }));
      }),
    );
    // Spanish prompt on purpose: it matches the planner's fill step regexes.
    return runCordy(
      parseCliArgs([
        'llena el formulario',
        '--start-url',
        startUrl,
        '--input',
        'amount=10,000',
        ...flags,
      ]),
    );
  };

  it('reports planned expectations in dry-run', async () => {
    const result = await run('--dry-run', '--expect', 'text:Summary', '--expect-url', startUrl);
    expect(result.expectations).toEqual([
      {
        spec: 'text:Summary',
        kind: 'text',
        negated: false,
        expected: 'Summary',
        status: 'planned',
      },
      {
        spec: `--expect-url ${startUrl}`,
        kind: 'url',
        negated: false,
        expected: startUrl,
        status: 'planned',
      },
    ]);
    expect(result.warnings).toBeUndefined();
  }, 30_000);

  it('verifies expectations in a live run and warns when all are negated', async () => {
    const passing = await run(
      '--expect',
      'text:Summary ${input.amount}',
      '--expect',
      'button:Continue',
      '--expect',
      'title:result',
    );
    expect(passing.expectations.map((item) => item.status)).toEqual(['passed', 'passed', 'passed']);
    const negatedOnly = await run('--expect', 'not-text:Error');
    expect(negatedOnly.expectations).toEqual([
      expect.objectContaining({ spec: 'not-text:Error', negated: true, status: 'passed' }),
    ]);
    expect(negatedOnly.warnings).toEqual([expect.stringMatching(/All expectations are negated/)]);
  }, 30_000);

  it('never sends expectations or their resolved values to Jev', async () => {
    jevRequests.length = 0;
    // The resolved value QX-4471 appears nowhere on the page, so it can only leak via expectations.
    await run(
      '--dry-run',
      '--input',
      'amount=QX-4471',
      '--expect',
      'text:Total ${input.amount}',
      '--expect',
      'title:Zebra',
    );
    expect(jevRequests.length).toBeGreaterThan(0);
    for (const body of jevRequests) {
      expect(body).not.toContain('Zebra');
      expect(body).not.toContain('${input.amount}');
      expect(body).not.toContain('QX-4471');
    }
  }, 30_000);
});
