import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyExpectations } from '../src/expectation-check.js';
import { parseExpectation } from '../src/expectation-spec.js';

describe('live expectation verification', () => {
  let browser: Browser;
  let page: Page;
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  });
  afterAll(async () => browser.close());
  const verify = (inputs: Record<string, string>, ...specs: string[]) =>
    verifyExpectations(
      page,
      specs.map((spec) => parseExpectation(spec, Object.keys(inputs))),
      inputs,
    );

  it('waits for text that renders late and checks input echoes', async () => {
    await page.setContent(`
      <p id="late"></p>
      <script>setTimeout(() => { document.getElementById('late').textContent = 'Total 10,000 MXN' }, 1500)</script>`);
    const results = await verify(
      { amount: '10,000' },
      'text:Total',
      'text:${input.amount}',
      'not-text:/error/i',
    );
    expect(results.map((result) => result.status)).toEqual(['passed', 'passed', 'passed']);
  });

  it('checks every kind against a form', async () => {
    await page.setContent(`
      <title>Result page</title>
      <label>Monthly payment <input value="$1,250.00"></label>
      <label><input type="checkbox" checked> Accept terms</label>
      <label><input type="checkbox"> Newsletter</label>
      <button>Send</button><button disabled>Pay</button>
      <ul><li>Row</li><li>Row</li><li>Row</li></ul>
      <p style="display:none">Error hidden</p>`);
    const results = await verify(
      {},
      'value:Monthly payment=1,250.00',
      'checked:Accept terms',
      'unchecked:Newsletter',
      'not-checked:Newsletter',
      'button:Send',
      'button-enabled:Send',
      'button-disabled:Pay',
      'not-button:Delete',
      'title:result',
      'url:about:blank',
      'count:Row=3',
      'not-text:Error',
    );
    expect(results.filter((result) => result.status !== 'passed')).toEqual([]);
  });

  it('reports the observed value when an expectation fails', async () => {
    await page.setContent(`<label>Amount <input value=""></label>`);
    const [result] = await verify({}, 'value:Amount=10000');
    expect(result).toEqual({
      spec: 'value:Amount=10000',
      kind: 'value',
      negated: false,
      expected: 'Amount=10000',
      status: 'failed',
      actual: '',
    });
  }, 15_000);

  it('redacts the observed value of sensitive fields', async () => {
    await page.setContent(`
      <label>Password <input type="password" value="hunter2"></label>
      <label>Secret code <input value="abc"></label>`);
    const results = await verify({}, 'value:Password=secret', 'value:Secret code=zzz');
    expect(results.map((result) => result.actual)).toEqual(['[redacted]', '[redacted]']);
  }, 15_000);

  it('reports the matching text when a negated text fails', async () => {
    await page.setContent('<p>Error: required field</p>');
    const [result] = await verify({}, 'not-text:required');
    expect(result).toMatchObject({ status: 'failed', actual: 'Error: required field' });
  }, 15_000);
});
