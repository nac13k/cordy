import { describe, expect, it } from 'vitest';
import { generateTypeScript } from '../src/run.js';

describe('generated input sources', () => {
  it('embeds inline inputs as a fixed input constant', () => {
    const source = generateTypeScript([], 'https://example.test', 'test', [], [], [], { kind: 'inline', values: { email: 'ana@example.test' } });
    expect(source).toContain('const input = {');
    expect(source).toContain('ana@example.test');
    expect(source).not.toContain('readFileSync');
  });

  it('reads file inputs at test execution time', () => {
    const source = generateTypeScript([], 'https://example.test', 'test', [], [], [], { kind: 'file', path: './inputs.json' });
    expect(source).toContain('readFileSync("./inputs.json"');
    expect(source).toContain('const input = resolveInputRecord');
    expect(source).not.toContain('ana@example.test');
  });

  it('keeps secret-like inline values external', () => {
    const source = generateTypeScript([], 'https://example.test', 'test', [], [], [], { kind: 'inline', values: { password: 'do-not-inline' } });
    expect(source).toContain('process.env["password"]');
    expect(source).not.toContain('do-not-inline');
  });
});
