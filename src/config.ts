import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

export const CordyConfig = z.object({
  jev: z
    .object({ apiKeyEnv: z.string().default('JEV_API_KEY'), endpoint: z.string().url().optional() })
    .default({ apiKeyEnv: 'JEV_API_KEY' }),
  browser: z
    .object({
      headed: z.boolean().default(false),
      startUrl: z.string().url().optional(),
      origin: z.string().url().optional(),
      maxSteps: z.number().int().positive().max(100).default(20),
    })
    .default({ headed: false, maxSteps: 20 }),
});
export type CordyConfig = z.infer<typeof CordyConfig>;
export type ConfigFormat = 'toml' | 'yaml';

const tomlTemplate = `[jev]\napi_key_env = "JEV_API_KEY"\n# endpoint = "https://api.typesafe.ai/v1/systemone"\n\n[browser]\nheaded = false\nmax_steps = 20\n# start_url = "http://127.0.0.1:3000"\n# origin = "http://127.0.0.1:3000"\n`;
const yamlTemplate = `jev:\n  api_key_env: JEV_API_KEY\n  # endpoint: https://api.typesafe.ai/v1/systemone\nbrowser:\n  headed: false\n  max_steps: 20\n  # start_url: http://127.0.0.1:3000\n  # origin: http://127.0.0.1:3000\n`;

function normalize(raw: Record<string, unknown>): CordyConfig {
  const jev = (raw.jev || {}) as Record<string, unknown>;
  const browser = (raw.browser || {}) as Record<string, unknown>;
  return CordyConfig.parse({
    jev: { apiKeyEnv: jev.api_key_env ?? jev.apiKeyEnv ?? 'JEV_API_KEY', endpoint: jev.endpoint },
    browser: {
      headed: browser.headed ?? false,
      startUrl: browser.start_url ?? browser.startUrl,
      origin: browser.origin,
      maxSteps: browser.max_steps ?? browser.maxSteps ?? 20,
    },
  });
}

export async function createConfigFile(directory: string, format: ConfigFormat = 'toml') {
  await mkdir(directory, { recursive: true });
  const file = join(directory, format === 'toml' ? 'cordy.config.toml' : 'cordy.config.yaml');
  await writeFile(file, format === 'toml' ? tomlTemplate : yamlTemplate, 'utf8');
  return file;
}
export async function loadConfig(file: string): Promise<CordyConfig> {
  const raw = await readFile(file, 'utf8');
  return normalize(
    (extname(file) === '.yaml' || extname(file) === '.yml'
      ? parseYaml(raw)
      : parseToml(raw)) as Record<string, unknown>,
  );
}
export function findConfig(directory: string, explicit?: string) {
  if (explicit) return explicit;
  for (const file of ['cordy.config.toml', 'cordy.config.yaml', 'cordy.config.yml']) {
    const path = join(directory, file);
    if (existsSync(path)) return path;
  }
  return undefined;
}
export function configEnvKey(config: CordyConfig) {
  return process.env[config.jev.apiKeyEnv];
}
