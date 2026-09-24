import { z } from 'zod';

export const EXPECTATION_KINDS = [
  'text',
  'button',
  'button-enabled',
  'button-disabled',
  'url',
  'title',
  'value',
  'checked',
  'unchecked',
  'count',
] as const;
export type ExpectationKind = (typeof EXPECTATION_KINDS)[number];

export const Matcher = z.object({
  type: z.enum(['substring', 'regex', 'exact']),
  source: z.string(),
  flags: z.string(),
  inputRefs: z.array(z.string()),
});
export type Matcher = z.infer<typeof Matcher>;

const Base = { negated: z.boolean(), spec: z.string(), expected: z.string() };
export const Expectation = z.discriminatedUnion('kind', [
  z.object({
    kind: z.enum(['text', 'button', 'button-enabled', 'button-disabled', 'url', 'title']),
    ...Base,
    matcher: Matcher,
  }),
  z.object({ kind: z.literal('value'), ...Base, label: z.string().min(1), matcher: Matcher }),
  z.object({ kind: z.enum(['checked', 'unchecked']), ...Base, label: z.string().min(1) }),
  z.object({
    kind: z.literal('count'),
    ...Base,
    matcher: Matcher,
    count: z.number().int().nonnegative(),
  }),
]);
export type Expectation = z.infer<typeof Expectation>;

export const INPUT_REF = /\$\{input\.([A-Za-z_][A-Za-z0-9_.-]*)\}/g;

export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fail(spec: string, message: string): never {
  throw new Error(`invalid --expect "${spec}": ${message}`);
}

function inputRefs(source: string) {
  return [...source.matchAll(INPUT_REF)].map((match) => match[1]);
}

export function parseMatcher(
  spec: string,
  value: string,
  inputKeys: Iterable<string> | undefined,
): Matcher {
  if (!value)
    fail(spec, 'the matcher is empty (use single quotes so the shell does not expand $ or ${...})');
  const regex = value.length > 1 ? value.match(/^\/(.*)\/([imsu]*)$/s) : null;
  const matcher: Matcher = regex
    ? { type: 'regex', source: regex[1], flags: regex[2], inputRefs: inputRefs(regex[1]) }
    : { type: 'substring', source: value, flags: 'i', inputRefs: inputRefs(value) };
  if (matcher.type === 'regex') {
    if (new Set(matcher.flags).size !== matcher.flags.length)
      fail(spec, `repeated regex flags "${matcher.flags}"`);
    try {
      new RegExp(matcher.source.replace(INPUT_REF, 'x'), matcher.flags);
    } catch (error) {
      fail(spec, `invalid regular expression (${(error as Error).message})`);
    }
  }
  if (inputKeys) {
    const known = new Set(inputKeys);
    const missing = matcher.inputRefs.find((key) => !known.has(key));
    if (missing) fail(spec, `references input "${missing}", which was not provided`);
  }
  return matcher;
}

export function exactMatcher(value: string): Matcher {
  return { type: 'exact', source: value, flags: '', inputRefs: [] };
}

/** Parses one --expect spec. Input references are only checked when `inputKeys` is given. */
export function parseExpectation(spec: string, inputKeys?: Iterable<string>): Expectation {
  const colon = spec.indexOf(':');
  if (colon < 1) fail(spec, `expected [not-]<kind>:<arg>; kinds: ${EXPECTATION_KINDS.join(', ')}`);
  const rawKind = spec.slice(0, colon);
  const arg = spec.slice(colon + 1);
  const negated = rawKind.startsWith('not-');
  const kind = (negated ? rawKind.slice(4) : rawKind) as ExpectationKind;
  if (!EXPECTATION_KINDS.includes(kind))
    fail(spec, `unknown kind "${rawKind}"; kinds: ${EXPECTATION_KINDS.join(', ')}`);
  const base = { negated, spec, expected: arg };
  if (kind === 'count') {
    if (negated) fail(spec, 'count cannot be negated');
    const separator = arg.lastIndexOf('=');
    const count = arg.slice(separator + 1);
    if (separator < 0 || !/^\d+$/.test(count)) fail(spec, 'count requires <matcher>=<n>');
    return {
      kind,
      ...base,
      matcher: parseMatcher(spec, arg.slice(0, separator), inputKeys),
      count: Number(count),
    };
  }
  if (kind === 'value') {
    const separator = arg.indexOf('=');
    if (separator < 1) fail(spec, 'value requires <label>=<matcher>');
    return {
      kind,
      ...base,
      label: arg.slice(0, separator),
      matcher: parseMatcher(spec, arg.slice(separator + 1), inputKeys),
    };
  }
  if (kind === 'checked' || kind === 'unchecked') {
    if (!arg) fail(spec, `${kind} requires a label`);
    return { kind, ...base, label: arg };
  }
  return { kind, ...base, matcher: parseMatcher(spec, arg, inputKeys) };
}

/** Builds the RegExp for a matcher, inserting resolved input values literally. */
export function compileMatcher(matcher: Matcher, inputs: Record<string, string>) {
  const withInputs = (source: string, literal: boolean) =>
    (matcher.inputRefs.length === 0 ? [source] : source.split(INPUT_REF))
      .map((part, index) =>
        index % 2 === 1 ? escapeRegex(inputs[part] ?? '') : literal ? escapeRegex(part) : part,
      )
      .join('');
  if (matcher.type === 'exact') return new RegExp(`^${escapeRegex(matcher.source)}$`);
  if (matcher.type === 'substring') return new RegExp(withInputs(matcher.source, true), 'i');
  return new RegExp(withInputs(matcher.source, false), matcher.flags);
}

export type ExpectationSources = {
  expect: string[];
  expectVisible: string[];
  expectButtons: string[];
  expectUrl: string[];
};

/** Merges --expect and the legacy --expect-* aliases. */
export function collectExpectations(
  sources: ExpectationSources,
  inputKeys: Iterable<string> = [],
): Expectation[] {
  const keys = [...inputKeys];
  const all: Expectation[] = [
    ...sources.expect.map((spec) => parseExpectation(spec, keys)),
    ...sources.expectVisible.map((value) => parseExpectation(`text:${value}`, keys)),
    ...sources.expectButtons.map((value) => parseExpectation(`button:${value}`, keys)),
    ...sources.expectUrl.map((value): Expectation => ({
      kind: 'url',
      negated: false,
      spec: `--expect-url ${value}`,
      expected: value,
      matcher: exactMatcher(value),
    })),
  ];
  const seen = new Set<string>();
  return all.filter((expectation) => {
    const key = JSON.stringify([
      expectation.kind,
      expectation.negated,
      expectation.expected,
      'matcher' in expectation ? expectation.matcher.type : '',
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
