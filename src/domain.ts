import { z } from 'zod';

export const InputValue = z.union([z.string(), z.number(), z.boolean()]);
export const InputRecord = z.record(z.string(), InputValue);
export const CliOptions = z.object({
  task: z.string().optional(), promptFile: z.string().optional(), inputs: z.record(z.string(), InputValue).default({}),
  headed: z.boolean().default(false), dryRun: z.boolean().default(false), output: z.string().optional(),
  startUrl: z.string().url().optional(), origin: z.string().url().optional(), maxSteps: z.number().int().positive().max(100).default(20), json: z.boolean().default(false), verbose: z.boolean().default(false), approve: z.boolean().default(false),
});
export type CliOptions = z.infer<typeof CliOptions>;
export type InputRecord = z.infer<typeof InputRecord>;

export const LocatorStrategy = z.enum(['getByRole', 'getByLabel', 'getByPlaceholder', 'getByText', 'testId', 'locator']);
export const LocatorSpec = z.object({ strategy: LocatorStrategy, value: z.string(), confidence: z.number().min(0).max(1), evidenceId: z.string() });
export const PlannedAction = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('goto'), url: z.string().url(), reason: z.string() }),
  z.object({ kind: z.literal('fill'), locator: LocatorSpec, inputKey: z.string(), reason: z.string() }),
  z.object({ kind: z.literal('click'), locator: LocatorSpec, reason: z.string(), highImpact: z.boolean().default(false) }),
  z.object({ kind: z.literal('select'), locator: LocatorSpec, inputKey: z.string(), reason: z.string() }),
  z.object({ kind: z.literal('check'), locator: LocatorSpec, inputKey: z.string(), reason: z.string() }),
  z.object({ kind: z.literal('wait'), reason: z.string() }),
  z.object({ kind: z.literal('needs_review'), reason: z.string() }),
]);
export type PlannedAction = z.infer<typeof PlannedAction>;

export type InteractiveElement = { id: string; role: string; name: string; label?: string; placeholder?: string; inputType?: string; valueState: 'empty' | 'filled' | 'secret_or_redacted'; visible: boolean; enabled: boolean; locatorCandidates: Array<{ strategy: z.infer<typeof LocatorStrategy>; value: string }> };
export type BrowserState = { task: string; page: { url: string; title: string; origin: string }; interactiveElements: InteractiveElement[]; visibleText: string; observationId: string; observedAt: string };
export type ActionRecord = { action: PlannedAction; status: 'planned' | 'approved' | 'succeeded' | 'failed' | 'blocked'; error?: string };
