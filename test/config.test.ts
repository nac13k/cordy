import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createConfigFile, loadConfig } from '../src/config.js';

describe('Cordy config', () => {
  it('creates a TOML template referencing an environment credential', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cordy-'));
    const file = await createConfigFile(directory, 'toml');
    const content = await readFile(file, 'utf8');
    expect(file.endsWith('cordy.config.toml')).toBe(true);
    expect(content).toContain('api_key_env = "JEV_API_KEY"');
    expect(content).not.toContain('sk-');
    expect((await loadConfig(file)).jev?.apiKeyEnv).toBe('JEV_API_KEY');
  });
  it('creates and loads YAML without storing a raw key', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cordy-'));
    const file = await createConfigFile(directory, 'yaml');
    const content = await readFile(file, 'utf8');
    expect(file.endsWith('cordy.config.yaml')).toBe(true);
    expect(content).toContain('api_key_env: JEV_API_KEY');
    expect((await loadConfig(file)).browser?.headed).toBe(false);
  });
});
