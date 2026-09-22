import { expect, test } from '@playwright/test';

test('cordy automation', async ({ page }) => {
  const inputs = process.env as Record<string, string>;
  await page.goto("https://example.test");
  await page.locator("[data-event=\"lan_cotizador_iniciar\"]").click();
  await page.locator("#peso").fill(inputs.peso);
  await page.locator("#monto_del_credito").fill(inputs.monto);
  await page.getByRole("button", { name: "Simular" }).click();
  await expect(page.getByText("Guardar cotización").first()).toBeVisible();
});

// Inputs are intentionally external and must be provided by the generated consumer.