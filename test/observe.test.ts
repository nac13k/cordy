import { describe, expect, it } from 'vitest';
import { chromium } from '@playwright/test';
import { observePage } from '../src/observe.js';

describe('page observation', () => {
  it('observes visible anchors as links with accessible locators', async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent('<a href="/cotizador-envios">Cotizador de envíos</a>');
    const state = await observePage(page, 'entra a la sección cotizador de envíos', 'obs-link');
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
  it('observes hidden file inputs with role file, accept, and multiple', async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(`
      <label for="doc" class="button">Upload document</label>
      <input type="file" id="doc" accept=".pdf,image/*" style="display:none">
      <div><button type="button">Add attachments</button><input type="file" name="attachments" multiple hidden></div>
      <div><span>Proof of address</span><input type="file" hidden></div>
    `);
    const state = await observePage(page, 'upload', 'obs-file');
    const files = state.interactiveElements.filter((element) => element.role === 'file');
    expect(files).toEqual([
      expect.objectContaining({
        name: 'Upload document',
        accept: '.pdf,image/*',
        multiple: false,
        visible: false,
        valueState: 'empty',
        locatorCandidates: [
          { strategy: 'locator', value: '#doc' },
          { strategy: 'getByLabel', value: 'Upload document' },
        ],
      }),
      expect.objectContaining({
        name: 'attachments',
        multiple: true,
        locatorCandidates: expect.arrayContaining([
          { strategy: 'locator', value: 'input[type="file"][name="attachments"]' },
        ]),
      }),
      expect.objectContaining({
        name: 'Proof of address',
        locatorCandidates: [{ strategy: 'locator', value: 'input[type="file"] >> nth=2' }],
      }),
    ]);
    await page.setInputFiles('#doc', {
      name: 'a.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('x'),
    });
    const after = await observePage(page, 'upload', 'obs-file-2');
    expect(
      after.interactiveElements.find((element) => element.name === 'Upload document'),
    ).toMatchObject({
      valueState: 'filled',
    });
    expect(JSON.stringify(after)).not.toContain('a.pdf');
    await browser.close();
  });
});
