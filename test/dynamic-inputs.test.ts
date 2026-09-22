import { describe, expect, it } from 'vitest';
import { resolveInputTemplate } from '../src/dynamic-inputs.js';

describe('dynamic input templates', () => {
  it('resolves timestamp and bounded random integer expressions', () => {
    const value = resolveInputTemplate('dias ${randInt(10, 20)}-${timestamp()}', { now: () => 1700000000000, random: () => 0.5 });
    expect(value).toBe('dias 15-1700000000000');
  });

  it('resolves allowlisted faker fields without evaluating code', () => {
    const value = resolveInputTemplate('${faker.name} <${faker.email}>', { faker: { name: 'Ana Legumbres', email: 'ana@example.test' } });
    expect(value).toBe('Ana Legumbres <ana@example.test>');
  });

  it('rejects unsupported expressions', () => {
    expect(() => resolveInputTemplate('${process.env.SECRET}')).toThrow(/expresión no permitida/i);
  });
});
