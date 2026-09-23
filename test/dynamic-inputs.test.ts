import { describe, expect, it } from 'vitest';
import { resolveInputRecord, resolveInputTemplate } from '../src/dynamic-inputs.js';

describe('dynamic input templates', () => {
  it('resolves timestamp and bounded random values', () => {
    expect(
      resolveInputTemplate('id-${timestamp()}-${randInt(10, 12)}', {
        now: () => 1700000000000,
        random: () => 0.5,
      }),
    ).toBe('id-1700000000000-11');
  });

  it('resolves faker placeholders', () => {
    expect(
      resolveInputTemplate('${faker.name} / ${faker.email}', {
        faker: { name: 'Ana Legumbres', email: 'ana@example.test' },
      }),
    ).toBe('Ana Legumbres / ana@example.test');
  });

  it('evaluates the same template again with a new execution context', () => {
    const template = { email: 'correo+${timestamp()}@example.com' };
    expect(resolveInputRecord(template, { now: () => 1000 })).toEqual({
      email: 'correo+1000@example.com',
    });
    expect(resolveInputRecord(template, { now: () => 2000 })).toEqual({
      email: 'correo+2000@example.com',
    });
  });
});
