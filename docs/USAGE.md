# Guía de uso de Cordy

Esta guía amplía el README para equipos que instalarán Cordy desde npm y lo usarán para flujos Playwright reproducibles.

## 1. Modelo mental

Cordy separa cuatro responsabilidades:

1. El usuario describe el flujo y proporciona inputs explícitos.
2. Cordy observa controles accesibles y estado reducido de la página.
3. Jev propone una acción estructurada dentro del conjunto permitido.
4. Cordy valida y Playwright ejecuta la acción.

Jev no es un ejecutor de código. No recibe API keys, cookies, headers de autorización, valores reales de inputs, HTML completo ni texto completo de la página.

## 2. Instalación recomendada

Para un proyecto de pruebas:

```bash
npm install --save-dev cordy
npx playwright install chromium
```

Para una prueba puntual:

```bash
npx cordy@0.1.0 --help
npx playwright install chromium
```

Cordy requiere Node.js `>=20`. El paquete publica el binario `cordy` y la API ESM en `dist`.

## 3. Variables y configuración

Configura el secreto en el entorno:

```bash
export JEV_API_KEY='...'
```

Genera una plantilla:

```bash
npx cordy init
# o
npx cordy init --format yaml
```

La configuración usa `api_key_env`, no `api_key`:

```toml
[jev]
api_key_env = "JEV_API_KEY"

[browser]
headed = false
max_steps = 20
```

No pongas secretos en TOML, YAML, argumentos, JSON de inputs, código generado ni logs.

## Inputs dinámicos

Cordy admite un DSL cerrado para datos variables, sin ejecutar JavaScript arbitrario:

```text
${timestamp()}
${randInt()}
${randInt(100, 999)}
${faker.name}
${faker.email}
${faker.firstName}
${faker.lastName}
${faker.phone}
```

Ejemplo:

```bash
npx cordy \
  "Completa el registro" \
  --start-url https://example.test \
  --input email='correo+${timestamp()}@example.com' \
  --input nombre='${faker.name}' \
  --input referencia='dias ${randInt(10, 99)}'
```

Las plantillas se resuelven una vez por ejecución, en memoria. No se aceptan `eval`, `process.env`, imports, llamadas arbitrarias ni acceso a funciones fuera de la allowlist. Las salidas generadas conservan la fuente de inputs: los valores `key=value` quedan en `const input` y sus plantillas se evalúan al inicio de cada ejecución, mientras que un archivo se lee con `readFileSync` al ejecutar la prueba. Las claves sensibles no se incrustan y se mantienen como variables de entorno.

## 4. Flujo completo con expectativas inferidas
```bash
npx cordy \
  "simula un credito entrando a la seccion cotiza tu envio y llenando el formulario y al simular debe de presentar como resultado esperado una pantalla con los resumen del envio y un boton de guardar cotización" \
  --start-url https://example.test \
  --input peso=3500000 \
  --input monto=2500000 \
  --output ./playwright/cotizar-envio.spec.ts \
  --output-kind test \
  --headed \
  --verbose
```

La frase `resultado esperado` y las condiciones explícitas permiten inferir:

- un texto o región visible relacionado con `resumen del envio`;
- un elemento visible con rol `button` y nombre parecido a `guardar cotización`.

Las expectativas se validan después de ejecutar el último clic del flujo. La prueba generada conserva los asserts.

## 5. Expectativas explícitas

Usa flags explícitos si quieres separar la especificación del prompt:

```bash
--expect-visible "Resumen de la solicitud"
--expect-button "Guardar cotización"
--expect-url "https://example.test/resultado"
```

Puedes repetir cada uno. Las expectativas explícitas se agregan a las inferidas; no sustituyen la validación local.

## 6. Diferencia entre `test` y `automation`

`--output-kind test` genera un archivo consumible por `@playwright/test`:

```tsx
import { expect, test } from '@playwright/test';
```

Incluye `expect(...).toBeVisible()` y `expect(page).toHaveURL(...)`.

`--output-kind automation` genera un script de Playwright con `waitFor` para las expectativas, sin importar `@playwright/test`.

El archivo no se escribe si omites `--output`.

## 7. Ejecución segura

Usa `--dry-run` para observar el plan sin ejecutar acciones:

```bash
npx cordy \
  "Completa el flujo" \
  --start-url https://staging.example.test \
  --input email=ana@example.com \
  --dry-run \
  --json
```

Usa `--headed` para depurar selectores y navegación. Usa `--headless` en CI. Ajusta `--max-steps` para evitar ciclos:

```bash
--max-steps 12
```

Los flujos actuales son de prueba y terminan después del clic final de impacto seleccionado por Jev. No uses el flujo contra producción sin controles externos.

## 8. Diagnóstico de fallos

### URL inválida

Incorrecto:

```text
example.test
```

Correcto:

```text
https://example.test
```

### Credencial ausente

Verifica solo la existencia de la variable sin imprimirla:

```bash
if [ -n "$JEV_API_KEY" ]; then echo "JEV_API_KEY configurada"; else echo "JEV_API_KEY ausente"; fi
```

### Acción bloqueada

Una respuesta como:

```text
Jev propuso fill sobre un elemento role=button
```

indica que la validación local rechazó una combinación de acción y rol. No desactives esa protección; usa `--verbose`, `--headed` y revisa la página observada.

### Expectativa fallida

Ejecuta con `--json` y revisa `expectations`:

```bash
npx cordy ... --json > result.json
```

Cada registro indica `kind`, `expected` y `status`. Una expectativa `failed` devuelve código `1`.

## 9. CI y artefactos

Ejemplo:

```bash
npm ci
npx playwright install --with-deps chromium

npx cordy \
  --prompt-file tasks/flow.txt \
  --input tasks/flow.inputs.json \
  --start-url https://staging.example.test \
  --headless \
  --output artifacts/flow.spec.ts \
  --output-kind test \
  --json > artifacts/flow.result.json
```

El secreto debe venir del gestor de secretos de CI. No guardes el JSON de inputs si contiene datos sensibles. Publica los artefactos solo después de revisar que no contienen valores privados.

## 10. Preparación para npm

Antes de publicar o actualizar:

```bash
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

`npm pack --dry-run` debe incluir al menos:

```text
README.md
LICENSE
dist/
```

Y no debe incluir:

```text
.env
credenciales
logs privados
archivos temporales
```

Para una publicación autorizada:

```bash
npm whoami
npm version patch
npm publish
```

La API pública está en versión `0.x`; fija una versión en proyectos de CI si necesitas reproducibilidad.
