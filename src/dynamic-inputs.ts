import { faker as defaultFaker } from '@faker-js/faker';

export type DynamicInputContext = {
  now?: () => number;
  random?: () => number;
  faker?: {
    name?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  };
};

function randInt(min: number, max: number, random: () => number) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function resolveExpression(expression: string, context: Required<Pick<DynamicInputContext, 'now' | 'random'>> & Pick<DynamicInputContext, 'faker'>): string {
  const trimmed = expression.trim();
  if (trimmed === 'timestamp()') return String(context.now());
  const randomMatch = trimmed.match(/^randInt\(\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (trimmed === 'randInt()') return String(randInt(0, 2_147_483_647, context.random));
  if (randomMatch) {
    const min = Number(randomMatch[1]); const max = Number(randomMatch[2]);
    if (min > max) throw new Error(`rango inválido en ${trimmed}`);
    return String(randInt(min, max, context.random));
  }
  const fake = context.faker;
  if (trimmed === 'faker.name') return fake?.name ?? defaultFaker.person.fullName();
  if (trimmed === 'faker.email') return fake?.email ?? defaultFaker.internet.email();
  if (trimmed === 'faker.firstName') return fake?.firstName ?? defaultFaker.person.firstName();
  if (trimmed === 'faker.lastName') return fake?.lastName ?? defaultFaker.person.lastName();
  if (trimmed === 'faker.phone') return fake?.phone ?? defaultFaker.phone.number();
  throw new Error(`expresión no permitida en input: ${trimmed}`);
}

export function resolveInputTemplate(value: string, context: DynamicInputContext = {}): string {
  if (!value.includes('${')) return value;
  const now = context.now ?? (() => Date.now());
  const random = context.random ?? Math.random;
  return value.replace(/\$\{([^{}]+)\}/g, (_match, expression: string) => resolveExpression(expression, { now, random, faker: context.faker }));
}

export function resolveInputRecord(inputs: Record<string, string>, context: DynamicInputContext = {}) {
  return Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, resolveInputTemplate(value, context)]));
}
