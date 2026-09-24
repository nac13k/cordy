import { describe, expect, it } from 'vitest';
import { collectExpectations, compileMatcher, parseExpectation } from '../src/expectation-spec.js';

describe('expectation spec parsing', () => {
  it.each([
    ['text:Summary', 'text'],
    ['button:Save quote', 'button'],
    ['button-enabled:Send', 'button-enabled'],
    ['button-disabled:Send', 'button-disabled'],
    ['title:Result', 'title'],
    ['not-text:required field', 'text'],
  ])('parses %s', (spec, kind) => {
    expect(parseExpectation(spec)).toMatchObject({ kind, spec });
  });
  it('splits at the first colon so URLs keep theirs', () => {
    expect(parseExpectation('url:https://example.test/result')).toMatchObject({
      kind: 'url',
      negated: false,
      expected: 'https://example.test/result',
      matcher: { type: 'substring', source: 'https://example.test/result' },
    });
  });
  it('parses value at the first = and count at the last =', () => {
    expect(parseExpectation('value:Monthly payment=1,250.00=x')).toMatchObject({
      label: 'Monthly payment',
      matcher: { source: '1,250.00=x' },
    });
    expect(parseExpectation('count:a=b=3')).toMatchObject({ matcher: { source: 'a=b' }, count: 3 });
  });
  it('parses checked and unchecked labels, including negation', () => {
    expect(parseExpectation('not-checked:Accept terms')).toMatchObject({
      kind: 'checked',
      negated: true,
      label: 'Accept terms',
    });
    expect(parseExpectation('unchecked:Newsletter')).toMatchObject({ kind: 'unchecked' });
  });
  it('parses regular expressions and keeps other slashes as substrings', () => {
    expect(parseExpectation('url:/\\/result\\/\\d+$/')).toMatchObject({
      matcher: { type: 'regex', source: '\\/result\\/\\d+$', flags: '' },
    });
    expect(parseExpectation('text:/total/iu')).toMatchObject({ matcher: { flags: 'iu' } });
    expect(parseExpectation('url:/checkout/success')).toMatchObject({
      matcher: { type: 'substring' },
    });
  });
  it('records input references', () => {
    expect(parseExpectation('text:Total ${input.amount}', ['amount'])).toMatchObject({
      matcher: { inputRefs: ['amount'] },
    });
  });
  it.each([
    ['visible:Summary', /unknown kind "visible".*text, button/],
    ['Summary', /\[not-\]<kind>:<arg>/],
    ['not-count:Row=3', /count cannot be negated/],
    ['count:Result row', /count requires <matcher>=<n>/],
    ['count:Row=-1', /count requires <matcher>=<n>/],
    ['value:Amount', /value requires <label>=<matcher>/],
    ['checked:', /checked requires a label/],
    ['text:', /matcher is empty.*single quotes/],
    ['text:/(/', /invalid regular expression/],
    ['text:/a/ii', /repeated regex flags/],
    ['text:${input.missing}', /references input "missing"/],
  ])('rejects %s', (spec, message) => {
    expect(() => parseExpectation(spec, [])).toThrow(message);
  });
  it('quotes the spec in errors', () => {
    expect(() => parseExpectation('visible:Summary')).toThrow('invalid --expect "visible:Summary"');
  });
});

function matcherOf(spec: string, inputKeys: string[] = []) {
  const expectation = parseExpectation(spec, inputKeys);
  if (!('matcher' in expectation)) throw new Error('no matcher');
  return expectation.matcher;
}

describe('matcher compilation', () => {
  it('matches substrings literally and case-insensitively', () => {
    const regex = compileMatcher(matcherOf('text:Total (MXN)'), {});
    expect(regex.test('the TOTAL (mxn) is')).toBe(true);
    expect(regex.test('Total MXN')).toBe(false);
  });
  it('inserts resolved input values literally in substrings and regexes', () => {
    const inputs = { amount: '10.000 (x)' };
    const substring = matcherOf('text:${input.amount}', ['amount']);
    expect(compileMatcher(substring, inputs).test('10.000 (x)')).toBe(true);
    expect(compileMatcher(substring, inputs).test('10a000 (x)')).toBe(false);
    const regex = matcherOf('text:/^Total: ${input.amount}$/', ['amount']);
    expect(compileMatcher(regex, inputs).test('Total: 10.000 (x)')).toBe(true);
  });
});

describe('collected expectations', () => {
  const none = { expect: [], expectVisible: [], expectButtons: [], expectUrl: [] };
  it('treats aliases like their --expect equivalents and removes duplicates', () => {
    const collected = collectExpectations({
      ...none,
      expect: ['text:Summary', 'button:Continue'],
      expectVisible: ['Summary'],
      expectButtons: ['Continue'],
      inferred: { visible: ['Summary'], buttons: [] },
    });
    expect(collected.map((item) => item.spec)).toEqual(['text:Summary', 'button:Continue']);
  });
  it('keeps --expect-url as an exact match distinct from url substrings', () => {
    const collected = collectExpectations({
      ...none,
      expect: ['url:https://example.test/result'],
      expectUrl: ['https://example.test/result'],
    });
    expect(collected).toHaveLength(2);
    if (!('matcher' in collected[1])) throw new Error('no matcher');
    const exact = compileMatcher(collected[1].matcher, {});
    expect(exact.test('https://example.test/result')).toBe(true);
    expect(exact.test('https://example.test/result?x=1')).toBe(false);
  });
  it('keeps prompt-inferred text literal', () => {
    const [inferred] = collectExpectations({
      ...none,
      inferred: { visible: [], buttons: ['/pre (aprobar)/'] },
    });
    if (!('matcher' in inferred)) throw new Error('no matcher');
    expect(compileMatcher(inferred.matcher, {}).test('/PRE (aprobar)/')).toBe(true);
  });
});
