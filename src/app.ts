import { parseCliArgs } from './cli-options.js';
import { runCordy } from './run.js';

export const help = `cordy - automatización Playwright con lenguaje natural y Jev

Uso:
  npx cordy "Completa el formulario" --start-url https://example.test --input email=ana@example.com
  npx cordy --prompt-file ./task.txt --input ./inputs.json --headed --output ./automation.ts

Opciones:
  --input <key=value|file.json>  Input repetible o archivo JSON
  --prompt-file <file>            Instrucción desde archivo
  --start-url <url>               URL inicial obligatoria
  --headed                        Mostrar el navegador
  --headless                      Ejecutar sin UI (default)
  --dry-run                       Planificar sin ejecutar
  --approve                       Aprobar acciones de impacto
  --output <file>                 Generar TypeScript
  --max-steps <n>                 Máximo de acciones (default: 20)
  --json                          Resultado JSON
  --verbose                       Diagnóstico en stderr
  --help                          Mostrar ayuda`;

export async function main(args = process.argv.slice(2)) {
  if (args.includes('--help') || args.includes('-h')) { console.log(help); return 0; }
  try {
    const options = parseCliArgs(args); const result = await runCordy(options);
    if (options.json) console.log(JSON.stringify(result, null, 2)); else console.log(`Cordy terminó con ${result.actions.length} acción(es): ${result.actions.map(action => action.status).join(', ')}`);
    return result.actions.some(action => action.status === 'failed') ? 1 : 0;
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); return 1; }
}
