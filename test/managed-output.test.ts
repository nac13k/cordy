import { describe, expect, it } from 'vitest';
import {
  applyManagedWrite,
  decideOutput,
  mergeImports,
  parseManagedFile,
  planManagedWrite,
  type RequiredImport,
} from '../src/managed-output.js';

const required: RequiredImport[] = [
  { module: '@playwright/test', names: ['expect', 'test'] },
  { module: '@nac13k/cordy', names: ['resolveInputRecord'] },
];
const header =
  "import { expect, test } from '@playwright/test';\nimport { resolveInputRecord } from '@nac13k/cordy';";
const block = (slug: string, body = '  // steps') =>
  `// cordy:begin ${slug}\ntest('${slug}', async ({ page }) => {\n${body}\n});\n// cordy:end ${slug}`;
const twoBlocks = `${header}\n\n${block('cotizar-envio')}\n\n${block('login')}\n`;

describe('parseManagedFile', () => {
  it('lists valid blocks in file order with line ranges', () => {
    const file = parseManagedFile(twoBlocks);
    expect(file.problems).toEqual([]);
    expect(file.blocks).toEqual([
      { slug: 'cotizar-envio', startLine: 4, endLine: 8, status: 'ok', problems: [] },
      { slug: 'login', startLine: 10, endLine: 14, status: 'ok', problems: [] },
    ]);
  });

  it('tolerates leading whitespace on markers', () => {
    const file = parseManagedFile('  // cordy:begin a\n  // cordy:end a');
    expect(file.blocks[0]).toMatchObject({ slug: 'a', endLine: 2, status: 'ok' });
  });

  it('reports a missing end marker', () => {
    const file = parseManagedFile('x\n// cordy:begin checkout\ntest();');
    expect(file.blocks[0]).toMatchObject({ slug: 'checkout', endLine: null, status: 'invalid' });
    expect(file.blocks[0].problems).toEqual([{ line: 2, message: "missing 'cordy:end checkout'" }]);
  });

  it('reports an end without begin', () => {
    expect(parseManagedFile('// cordy:end login').problems).toEqual([
      { line: 1, message: "'cordy:end login' without matching begin" },
    ]);
  });

  it('reports nested blocks', () => {
    const file = parseManagedFile('// cordy:begin a\n// cordy:begin b\n// cordy:end b');
    expect(file.blocks[0].problems[0].message).toMatch(/missing 'cordy:end a'/);
    expect(file.blocks[1].problems[0].message).toMatch(/nested inside 'a'/);
  });

  it('reports mismatched begin/end slugs', () => {
    const file = parseManagedFile('// cordy:begin a\n// cordy:end b');
    expect(file.blocks[0].problems[0]).toEqual({
      line: 2,
      message: "end slug 'b' does not match begin 'a'",
    });
  });

  it('reports duplicate slugs on every occurrence', () => {
    const file = parseManagedFile(`${block('login')}\n${block('login')}`);
    expect(file.blocks.map((item) => item.status)).toEqual(['invalid', 'invalid']);
    expect(file.blocks[1].problems[0].message).toBe("duplicate slug 'login'");
  });

  it('reports invalid slugs', () => {
    const file = parseManagedFile('// cordy:begin Login_Test\n// cordy:end Login_Test');
    expect(file.blocks[0].problems[0].message).toBe("invalid slug 'Login_Test'");
  });
});

describe('planManagedWrite', () => {
  it('appends when the file is missing', () => {
    expect(planManagedWrite(undefined, 'login', false)).toEqual({ kind: 'append' });
  });
  it('appends to a file without markers', () => {
    expect(planManagedWrite("test('manual', () => {});", 'login', false)).toEqual({
      kind: 'append',
    });
  });
  it('rejects an existing slug without --update', () => {
    expect(() => planManagedWrite(twoBlocks, 'login', false)).toThrow(/already exists.*--update/);
  });
  it('replaces an existing slug with --update', () => {
    expect(planManagedWrite(twoBlocks, 'login', true)).toEqual({
      kind: 'replace',
      startLine: 10,
      endLine: 14,
    });
  });
  it('rejects --update for a missing slug', () => {
    expect(() => planManagedWrite(twoBlocks, 'checkout', true)).toThrow(/does not exist/);
    expect(() => planManagedWrite(undefined, 'checkout', true)).toThrow(/does not exist/);
  });
  it('rejects malformed files with the problem line', () => {
    expect(() => planManagedWrite('// cordy:begin a', 'b', false)).toThrow(/line 1/);
  });
});

describe('mergeImports', () => {
  it('does not duplicate imports that already exist', () => {
    expect(mergeImports(`${header}\n\ncode();`, required)).toBe(`${header}\n\ncode();`);
  });
  it('adds a missing import once, after the last import', () => {
    const fs = [...required, { module: 'node:fs', names: ['readFileSync'] }];
    const merged = mergeImports(`${header}\n\ncode();`, fs);
    expect(merged).toBe(`${header}\nimport { readFileSync } from 'node:fs';\n\ncode();`);
    expect(mergeImports(merged, fs)).toBe(merged);
  });
  it('adds missing names to an existing named import and keeps unrelated imports', () => {
    const source =
      'import { test } from "@playwright/test";\nimport path from \'node:path\';\n\ncode();';
    expect(mergeImports(source, required)).toBe(
      'import { test, expect } from "@playwright/test";\nimport path from \'node:path\';\n' +
        "import { resolveInputRecord } from '@nac13k/cordy';\n\ncode();",
    );
  });
  it('writes imports into an empty file', () => {
    expect(mergeImports('', required)).toBe(header);
  });
});

describe('applyManagedWrite', () => {
  it('creates a new file with imports and the block', () => {
    expect(applyManagedWrite(undefined, 'login', block('login'), required, false)).toBe(
      `${header}\n\n${block('login')}\n`,
    );
  });
  it('appends after hand-written code without touching it', () => {
    const manual = `${header}\n\ntest('manual', async () => {});\n`;
    const next = applyManagedWrite(manual, 'login', block('login'), required, false);
    expect(next.startsWith(manual.trimEnd())).toBe(true);
    expect(next.endsWith(`${block('login')}\n`)).toBe(true);
  });
  it('replaces a block in place and leaves other blocks byte-for-byte unchanged', () => {
    const next = applyManagedWrite(
      twoBlocks,
      'cotizar-envio',
      block('cotizar-envio', '  // new steps'),
      required,
      true,
    );
    expect(next).toBe(
      `${header}\n\n${block('cotizar-envio', '  // new steps')}\n\n${block('login')}\n`,
    );
  });
});

describe('decideOutput', () => {
  const base = {
    file: 'flows.spec.ts',
    update: false,
    dryRun: false,
    diff: false,
    succeeded: true,
    requiredImports: required,
    renderFile: () => 'legacy',
    renderBlock: () => block('login'),
  };
  it('never writes in dry-run and describes the planned change', () => {
    const decision = decideOutput({
      ...base,
      current: twoBlocks,
      testName: 'login',
      update: true,
      dryRun: true,
    });
    expect(decision.write).toBeUndefined();
    expect(decision.message).toMatch(/'login' \(lines 10-14\) would be replaced/);
  });
  it('never writes in legacy dry-run', () => {
    expect(decideOutput({ ...base, current: undefined, dryRun: true }).write).toBeUndefined();
  });
  it('still reports conflicts in dry-run', () => {
    expect(() =>
      decideOutput({ ...base, current: twoBlocks, testName: 'login', dryRun: true }),
    ).toThrow(/--update/);
  });
  it('leaves the file unchanged when a managed run failed', () => {
    const decision = decideOutput({
      ...base,
      current: twoBlocks,
      testName: 'login',
      update: true,
      succeeded: false,
    });
    expect(decision).toEqual({ message: expect.stringMatching(/left unchanged/) });
  });
  it('keeps legacy overwrite even when the run failed', () => {
    expect(decideOutput({ ...base, current: 'old', succeeded: false })).toEqual({
      write: 'legacy',
    });
  });
  it('returns a diff instead of writing with --diff', () => {
    const decision = decideOutput({
      ...base,
      current: `${header}\n\n${block('login')}\n`,
      testName: 'login',
      update: true,
      diff: true,
      renderBlock: () => block('login', '  // changed'),
    });
    expect(decision.write).toBeUndefined();
    expect(decision.diff).toContain('-  // steps');
    expect(decision.diff).toContain('+  // changed');
  });
});
