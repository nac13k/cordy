import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseCliArgs } from '../src/cli-options.js';
import { loadInputs } from '../src/inputs.js';

describe('file inputs', () => {
  let cwd: string;
  beforeAll(() => {
    cwd = mkdtempSync(join(tmpdir(), 'cordy-inputs-'));
    mkdirSync(join(cwd, 'fixtures'));
    writeFileSync(join(cwd, 'fixtures', 'id.pdf'), '%PDF');
    writeFileSync(join(cwd, 'fixtures', 'proof.png'), 'png');
    writeFileSync(join(cwd, 'fixtures', 'locked.pdf'), '%PDF');
    chmodSync(join(cwd, 'fixtures', 'locked.pdf'), 0o000);
  });
  const load = (args: string[], json?: unknown) => {
    if (json !== undefined) writeFileSync(join(cwd, 'inputs.json'), JSON.stringify(json));
    const options = parseCliArgs([
      'task',
      ...args,
      ...(json !== undefined ? ['--input', join(cwd, 'inputs.json')] : []),
    ]);
    return loadInputs(options, cwd);
  };

  it('loads --file paths relative to the working directory', () => {
    expect(load(['--file', 'id_document=./fixtures/id.pdf', '--input', 'name=Ana'])).toEqual({
      values: { name: 'Ana' },
      files: { id_document: ['./fixtures/id.pdf'] },
    });
  });
  it('accepts typed file entries in the inputs file', () => {
    expect(
      load([], {
        proof: { type: 'file', path: './fixtures/proof.png' },
        attachments: { type: 'file', paths: ['./fixtures/id.pdf', './fixtures/proof.png'] },
        name: 'Ana',
        age: 34,
      }),
    ).toEqual({
      values: { name: 'Ana', age: '34' },
      files: {
        proof: ['./fixtures/proof.png'],
        attachments: ['./fixtures/id.pdf', './fixtures/proof.png'],
      },
    });
  });
  it('rejects other object shapes naming the key', () => {
    expect(() => load([], { proof: { file: './x.png' } })).toThrow(/invalid input: proof/);
    expect(() => load([], { proof: { type: 'file', paths: [] } })).toThrow(/invalid input: proof/);
    expect(() => load([], { proof: ['./x.png'] })).toThrow(/invalid input: proof/);
  });
  it('rejects a key provided both as a value and as a file', () => {
    expect(() => load(['--input', 'doc=abc', '--file', 'doc=./fixtures/id.pdf'])).toThrow(
      /doc is provided both/,
    );
  });
  it('rejects missing, directory, and unreadable paths naming key and path', () => {
    expect(() => load(['--file', 'id_document=./fixtures/missing.pdf'])).toThrow(
      'file input id_document: ./fixtures/missing.pdf is not a readable file',
    );
    expect(() => load(['--file', 'id_document=./fixtures'])).toThrow(/not a readable file/);
    if (process.getuid?.() !== 0)
      expect(() => load(['--file', 'id_document=./fixtures/locked.pdf'])).toThrow(
        /locked\.pdf is not a readable file/,
      );
  });
});
