import { parseCliArgs } from './cli-options.js';
import { runCordy } from './run.js';
import { createConfigFile, findConfig, loadConfig, type CordyConfig } from './config.js';

export const help = `cordy - automatización Playwright con lenguaje natural y Jev

Uso:
  npx cordy "Completa el formulario" --start-url https://example.test --input email=ana@example.com
  npx cordy --prompt-file ./task.txt --input ./inputs.json --headed --output ./automation.ts

Opciones:
  --input <key=value|file.json>  Input repetible o archivo JSON
  --prompt-file <file>            Instrucción desde archivo
  --config <file>                 Configuración TOML/YAML
  --start-url <url>               URL inicial obligatoria
  --headed                        Mostrar el navegador
  --headless                      Ejecutar sin UI (default)
  --dry-run                       Planificar sin ejecutar
  --approve                       Aprobar acciones de impacto
  --output <file>                 Generar TypeScript/TSX
  --output-kind <test|automation> Generar asserts o solo automatización
  --expect-visible <text>          Assert repetible de texto visible
  --expect-button <name>           Assert repetible de botón por nombre accesible
  --expect-url <url>               Assert repetible de URL
  --max-steps <n>                 Máximo de acciones (default: 20)
  --json                          Resultado JSON
  --verbose                       Diagnóstico seguro de cada interacción con Jev
  --help                          Mostrar ayuda`;

export async function main(args = process.argv.slice(2)) {
  if (args[0] === 'init') {
    const format = args.includes('--format') ? args[args.indexOf('--format') + 1] : 'toml';
    if (format !== 'toml' && format !== 'yaml') throw new Error('--format debe ser toml o yaml');
    const file = await createConfigFile(process.cwd(), format);
    console.log(`Configuración creada: ${file}`);
    return 0;
  }
  if (args.includes('--help') || args.includes('-h')) {
    console.log(help);
    return 0;
  }
  try {
    const options = parseCliArgs(args);
    const configPath = findConfig(process.cwd(), options.configFile);
    const config: CordyConfig = configPath
      ? await loadConfig(configPath)
      : { jev: { apiKeyEnv: 'JEV_API_KEY' }, browser: { headed: false, maxSteps: 20 } };
    const effective = {
      ...options,
      headed: options.headed || config.browser.headed,
      startUrl: options.startUrl ?? config.browser.startUrl,
      origin: options.origin ?? config.browser.origin,
      maxSteps: options.maxSteps === 20 ? config.browser.maxSteps : options.maxSteps,
    };
    const result = await runCordy(effective, config);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else
      console.log(
        `Cordy terminó con ${result.actions.length} acción(es): ${result.actions.map((action) => action.status).join(', ')}${result.expectations.length ? `; expectativas: ${result.expectations.map((expectation) => expectation.status).join(', ')}` : ''}`,
      );
    return result.actions.some((action) => action.status === 'failed') ||
      result.expectations.some((expectation) => expectation.status === 'failed')
      ? 1
      : 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
