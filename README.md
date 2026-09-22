# cordy

CLI TypeScript para ejecutar automatizaciones Playwright descritas en lenguaje natural y coordinadas por Jev.

Cordy observa la página actual, envía a Jev únicamente un estado reducido y redactado, valida localmente la acción estructurada recibida y deja que Playwright ejecute la interacción.

> Cordy está diseñado para flujos de prueba. En una ejecución normal completa los inputs, ejecuta el último clic seleccionado y detiene el flujo después de esa acción. No lo uses contra producción ni para operaciones irreversibles sin autorización independiente.

## Requisitos

- Node.js 20 o superior.
- Chromium de Playwright instalado en la máquina que ejecutará Cordy.
- Una credencial de Jev disponible únicamente como variable de entorno.
- Una URL inicial absoluta, incluyendo `https://` o `http://`.

Comprueba Node.js:

```bash
node --version
```

## Instalación desde npm

### Ejecución puntual con `npx`

No necesitas instalar Cordy globalmente:

```bash
npx cordy --help
```

Para evitar que `npx` elija una versión diferente de forma inesperada, fija la versión:

```bash
npx cordy@0.1.0 --help
```

Instala los navegadores de Playwright una sola vez por máquina:

```bash
npx playwright install chromium
```

### Instalación local en un proyecto

Recomendado para suites de pruebas reproducibles:

```bash
npm install --save-dev cordy
npx playwright install chromium
```

Ejecuta el binario local:

```bash
npx cordy "Completa el formulario" --start-url https://example.test
```

### Instalación global

```bash
npm install --global cordy
npx playwright install chromium
cordy --help
```

La instalación global es cómoda para uso manual, pero una dependencia local fija mejor la versión en CI y en equipos compartidos.

## Configuración de Jev

Cordy no recibe la API key como argumento y no la guarda en el archivo de configuración. Define la variable solo en el entorno del proceso:

```bash
export JEV_API_KEY='tu-credencial-de-jev'
```

También puedes cargarla desde un archivo `.env` con tu gestor de secretos o con el mecanismo de entorno de tu shell. No incluyas `.env` en Git.

Cordy usa por defecto:

```text
JEV_API_KEY
```

Para cambiar el nombre de la variable, crea una configuración:

```bash
npx cordy init
```

Se crea `cordy.config.toml`:

```toml
[jev]
api_key_env = "JEV_API_KEY"
# endpoint = "https://api.typesafe.ai/v1/systemone"

[browser]
headed = false
max_steps = 20
# start_url = "https://example.test"
# origin = "https://example.test"
```

La configuración solo contiene el nombre de la variable, nunca su valor. También puedes generar YAML:

```bash
npx cordy init --format yaml
```

Cordy descubre automáticamente, en el directorio actual, el primer archivo existente entre:

```text
cordy.config.toml
cordy.config.yaml
cordy.config.yml
```

Usa `--config` para indicar una ruta concreta:

```bash
npx cordy --config ./config/cordy.config.toml \
  "Completa el formulario" \
  --start-url https://example.test
```

## Primer flujo

```bash
export JEV_API_KEY='tu-credencial-de-jev'

npx cordy \
  "Completa el formulario de registro" \
  --start-url https://example.test/registro \
  --input email=ana@example.com \
  --input nombre=Ana \
  --headless
```

La URL inicial debe ser absoluta. Esto es válido:

```text
https://example.test
```

Esto no es válido para Playwright:

```text
example.test
```

Para ver el navegador:

```bash
npx cordy \
  "Completa el formulario de registro" \
  --start-url https://example.test/registro \
  --input email=ana@example.com \
  --headed
```

`--headless` es el comportamiento predeterminado y puede usarse para dejarlo explícito.

## Inputs

### Inputs `key=value`

Repite `--input` para cada valor que el flujo necesita:

```bash
npx cordy \
  "Simula el crédito" \
  --start-url https://example.test \
  --input peso=3500000 \
  --input monto=2500000
```

Los valores se usan localmente para ejecutar `fill`, `select` o `check`. Jev recibe los nombres y la disponibilidad de los inputs, pero no los valores reales.

### Inputs desde JSON

Crea `inputs.json`:

```json
{
  "email": "ana@example.com",
  "nombre": "Ana",
  "peso": "3500000"
}
```

Pásalo con `--input`:

```bash
npx cordy \
  --prompt-file ./task.txt \
  --input ./inputs.json \
  --start-url https://example.test
```

No guardes contraseñas ni tokens en un JSON versionado. Usa un almacén de secretos o genera el archivo temporalmente fuera del repositorio.

## Instrucciones desde archivo

`task.txt` puede contener una instrucción larga:

```text
Simula un crédito entrando a la sección de simulación, llena los valores proporcionados y verifica el resultado esperado.
```

Ejecuta:

```bash
npx cordy \
  --prompt-file ./task.txt \
  --input ./inputs.json \
  --start-url https://example.test \
  --output ./playwright/flujo.spec.ts
```

No combines una instrucción posicional con `--prompt-file`.

## Expectativas y asserts

Cordy puede recibir expectativas explícitas o inferirlas del prompt cuando están expresadas de forma inequívoca.

### Expectativas inferidas del prompt

Este prompt declara dos resultados esperados:

```text
Simula un crédito, llena el formulario y al simular debe presentar como resultado esperado una pantalla con los resumen del envío y un botón de guardar cotización.
```

Cordy propone:

```text
texto visible: resumen del envío
botón visible: guardar cotización
```

La salida de prueba contiene asserts equivalentes a:

```tsx
await expect(
  page.getByText(new RegExp("resumen del envio", "i")).first()
).toBeVisible();

await expect(
  page.getByRole("button", {
    name: new RegExp("guardar cotización", "i")
  })
).toBeVisible();
```

La expectativa del botón conserva el rol `button`; no se convierte en un `getByText` genérico. La comparación ignora mayúsculas y permite variaciones de presentación como `Guardar cotización`, `GUARDAR COTIZACIÓN` o un sufijo visual.

Cordy no debe inventar expectativas para frases vagas como `que todo salga bien`. Si la condición no aparece explícitamente o no puede mapearse a una observación verificable, no se genera un assert automático.

### Expectativas explícitas

Texto visible:

```bash
--expect-visible "resumen del envío"
```

Botón por nombre accesible:

```bash
--expect-button "Guardar cotización"
```

URL:

```bash
--expect-url "https://example.test/resultado"
```

Cada opción puede repetirse:

```bash
npx cordy \
  "Completa el flujo" \
  --start-url https://example.test \
  --expect-visible "Resumen de solicitud" \
  --expect-visible "Monto mensual" \
  --expect-button "Continuar" \
  --expect-url "https://example.test/resultado"
```

Las expectativas se comprueban en vivo al terminar el flujo. Una expectativa fallida hace que Cordy devuelva código de salida `1`.

## Generar una prueba o una automatización

### Prueba Playwright con asserts

`test` es el tipo de salida predeterminado:

```bash
npx cordy \
  "Simula el crédito y muestra el botón de guardar cotización como resultado esperado" \
  --start-url https://example.test \
  --input peso=3500000 \
  --input monto=2500000 \
  --output ./playwright/simulacion.spec.ts \
  --output-kind test
```

La salida importa `@playwright/test`, crea un `test(...)`, reproduce las acciones exitosas y añade los `expect(...)`.

### Automatización sin asserts

Usa `automation` cuando solo quieras la secuencia de interacción:

```bash
npx cordy \
  "Completa el flujo" \
  --start-url https://example.test \
  --input email=ana@example.com \
  --output ./playwright/flujo.ts \
  --output-kind automation
```

La salida usa Playwright directamente y espera la visibilidad de las condiciones explícitas sin importar `@playwright/test`.

`--output` es opcional. Sin él, Cordy no escribe el archivo de automatización.

## Simulación, ejecución y límite de pasos

Planificar sin interactuar con el sitio:

```bash
npx cordy \
  "Completa el flujo" \
  --start-url https://example.test \
  --input email=ana@example.com \
  --dry-run \
  --json
```

Limitar la cantidad de decisiones:

```bash
--max-steps 10
```

El valor permitido está entre `1` y `100`; el predeterminado es `20`.

`--approve` se conserva por compatibilidad de CLI. El comportamiento actual de Cordy considera las ejecuciones como flujos de prueba y permite el clic final de impacto para completar el flujo, deteniéndose inmediatamente después. La acción siempre debe pasar la validación local de rol, locator y estado de la página.

## Salida JSON y códigos de salida

Para integrarlo en scripts:

```bash
npx cordy \
  "Completa el flujo" \
  --start-url https://example.test \
  --json > result.json
```

El resultado incluye, entre otros campos:

```json
{
  "task": "Completa el flujo",
  "startUrl": "https://example.test",
  "actions": [
    {
      "status": "succeeded"
    }
  ],
  "expectations": [
    {
      "kind": "button",
      "expected": "Guardar cotización",
      "status": "passed"
    }
  ]
}
```

Códigos de salida:

- `0`: acciones y expectativas completadas.
- `1`: acción fallida, acción bloqueada, expectativa fallida o error de configuración/ejecución.

## Diagnóstico seguro

Añade `--verbose`:

```bash
npx cordy \
  "Completa el flujo" \
  --start-url https://example.test \
  --input email=ana@example.com \
  --verbose
```

Las trazas se escriben en `stderr`, por lo que `stdout` puede seguir conteniendo JSON limpio cuando usas `--json`.

El diagnóstico puede mostrar:

- endpoint y modelo de Jev;
- identificador de observación;
- URL sin query string ni fragmento;
- nombres de inputs;
- cantidad de candidatos y preguntas;
- código HTTP;
- respuestas tipadas y uso de tokens;
- acción seleccionada y resultado local.

Nunca debe mostrar:

- API keys o cabeceras `Authorization`;
- valores reales de inputs;
- contraseñas, cookies o tokens;
- HTML completo o texto completo de la página.

## Acciones soportadas y límites

Jev solo puede proponer acciones estructuradas de este conjunto:

- `goto`;
- `fill`;
- `select`;
- `check`;
- `click`;
- `wait`;
- `needs_review`.

Jev no ejecuta JavaScript, no escribe código Playwright y no recibe los valores reales de los inputs. Playwright solo ejecuta una acción después de la validación local contra los controles observados en la página actual.

Cordy bloquea, entre otros casos:

- `fill` sobre un botón;
- targets ausentes o ambiguos;
- controles que ya no coinciden con la observación;
- inputs no proporcionados;
- URLs iniciales inválidas;
- propuestas incompatibles con el rol accesible del elemento.

## Integración en CI

Ejemplo de instalación reproducible:

```bash
npm ci
npx playwright install --with-deps chromium
```

Configura `JEV_API_KEY` mediante el secreto del proveedor de CI, no mediante un commit ni una variable escrita en logs. Ejecuta en modo headless y conserva JSON como artefacto:

```bash
npx cordy \
  --prompt-file ./tasks/simulacion.txt \
  --input ./tasks/simulacion.inputs.json \
  --start-url https://staging.example.test \
  --headless \
  --output ./artifacts/simulacion.spec.ts \
  --output-kind test \
  --json > ./artifacts/simulacion.result.json
```

Revisa el archivo JSON y el código de salida antes de publicar resultados.

## Desarrollo desde el repositorio

```bash
git clone <url-del-repositorio>
cd cordy
npm ci
npx playwright install chromium
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

Comandos disponibles:

```bash
npm run typecheck
npm test
npm run test:watch
npm run build
npm run lint
npm pack --dry-run
```

## Publicación del paquete

La publicación es una operación externa y debe hacerse con una cuenta npm autorizada:

```bash
npm login
npm whoami
npm run typecheck
npm test
npm run build
npm pack --dry-run
npm publish
```

Antes de publicar una nueva versión:

1. actualiza la versión con `npm version`;
2. revisa `npm pack --dry-run`;
3. confirma que no se incluyen `.env`, credenciales, fixtures privados ni archivos temporales;
4. verifica que `dist`, `README.md` y `LICENSE` sí están incluidos;
5. publica desde un entorno con la credencial npm configurada de forma segura.

## API programática

El paquete también exporta la API TypeScript principal:

```ts
import { generateTypeScript, runCordy } from 'cordy';
```

El comando `cordy` es la interfaz recomendada para usuarios finales. La API programática está sujeta a cambios mientras el paquete permanezca en versión `0.x`.

## Licencia

MIT
