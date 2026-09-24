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

  describe('ambiguous locators and clickable elements', () => {
    const observe = async (html: string) => {
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.setContent(html);
      const state = await observePage(page, 'task', 'obs');
      return { browser, page, elements: state.interactiveElements };
    };

    it('pins repeated links to their position', async () => {
      const { browser, page, elements } = await observe(
        [1, 2, 3, 4]
          .map((n) => `<section><a href="/quote?from=${n}">Cotiza tu envío</a></section>`)
          .join(''),
      );
      expect(elements.map((element) => element.locatorCandidates[0])).toEqual(
        [0, 1, 2, 3].map((nth) => ({ strategy: 'getByRole', value: 'link:Cotiza tu envío', nth })),
      );
      expect(await page.evaluate(() => 'window.__cordyObserved' in window)).toBe(false);
      await browser.close();
    });

    it('pins a name contained in another name and leaves unique names alone', async () => {
      const { browser, elements } = await observe(
        '<button>Simular de nuevo</button><button>Simular</button><button>Salir</button>',
      );
      expect(elements.map((element) => element.locatorCandidates[0])).toEqual([
        { strategy: 'getByRole', value: 'button:Simular de nuevo' },
        { strategy: 'getByRole', value: 'button:Simular', nth: 1 },
        { strategy: 'getByRole', value: 'button:Salir' },
      ]);
      await browser.close();
    });

    it('keeps unique selectors without a position', async () => {
      const { browser, elements } = await observe(
        '<button id="a">Go</button><button data-event="b">Go</button>',
      );
      expect(elements.map((element) => element.locatorCandidates[0])).toEqual([
        { strategy: 'locator', value: '#a' },
        { strategy: 'locator', value: '[data-event="b"]' },
      ]);
      await browser.close();
    });

    it('observes a pointer-cursor card as clickable and pins repeated ones', async () => {
      const card = (text: string) =>
        `<div style="cursor:pointer"><h3>${text}</h3><p>Llega mañana</p></div>`;
      const { browser, elements } = await observe(
        card('Envío express') + card('Envío express') + '<div>Plain text</div>',
      );
      expect(elements).toEqual([
        expect.objectContaining({
          role: 'clickable',
          name: 'Envío express',
          locatorCandidates: [{ strategy: 'getByText', value: 'Envío express', nth: 0 }],
        }),
        expect.objectContaining({
          role: 'clickable',
          locatorCandidates: [{ strategy: 'getByText', value: 'Envío express', nth: 1 }],
        }),
      ]);
      await browser.close();
    });

    it('observes only the button inside a pointer-cursor card', async () => {
      const { browser, elements } = await observe(
        '<div style="cursor:pointer"><span>Envío express</span><button>Ver más</button></div>',
      );
      expect(elements.map((element) => [element.role, element.name])).toEqual([
        ['button', 'Ver más'],
      ]);
      await browser.close();
    });

    it('observes tabs, summaries, links without href, and onclick elements', async () => {
      const { browser, elements } = await observe(`
        <div role="tab">Paquetería</div>
        <details><summary>Detalles</summary></details>
        <a>Sin enlace</a>
        <span onclick="void 0">Abrir</span>`);
      expect(elements.map((element) => [element.role, element.locatorCandidates[0]])).toEqual([
        ['tab', { strategy: 'getByRole', value: 'tab:Paquetería' }],
        ['clickable', { strategy: 'getByText', value: 'Detalles' }],
        ['clickable', { strategy: 'getByText', value: 'Sin enlace' }],
        ['clickable', { strategy: 'getByText', value: 'Abrir' }],
      ]);
      await browser.close();
    });
  });
});
