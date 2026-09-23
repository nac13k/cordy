import { describe, expect, it } from 'vitest';
import { chromium } from '@playwright/test';
import { observePage } from '../src/observe.js';

describe('page observation', () => {
  it('observes visible anchors as links with accessible locators', async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent('<a href="/cotizador-envios">Cotizador de envíos</a>');
    const state = await observePage(page, 'entra a la seccion cotizador de envios', 'obs-link');
    expect(state.interactiveElements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'link',
          name: 'Cotizador de envíos',
          locatorCandidates: expect.arrayContaining([
            expect.objectContaining({ strategy: 'getByRole', value: 'link:Cotizador de envíos' }),
          ]),
        }),
      ]),
    );
    await browser.close();
  });
});
