import type { ActionRecord } from './domain.js';
import type { LoadedPlan } from './plan-file.js';

export type PlanStepKind = 'click' | 'submit' | 'fill' | 'wait';

/** One executable step. Plan files and split prompts both become a list of these. */
export type PlanStep = {
  index: number;
  kind: PlanStepKind;
  /** Name sent to Jev as the workflow step kind. */
  workflowKind: string;
  /**
   * How a target is checked: explicit target, quoted text, or free step text. Quoted fill steps
   * are anchored too; unquoted fill steps are not.
   */
  anchor: 'explicit' | 'quoted' | 'free';
  /** Natural-language step text, when the step came from one. */
  text?: string;
  target?: string;
  /** Explicit fill keys. A natural-language fill has none and consumes pending keys. */
  keys?: string[];
};

const QUOTED = /"([^"]+)"|“([^”]+)”/;

/**
 * Builds executable steps from a plan file. `classify` gives the kind Jev chose for each
 * natural-language step, by plan index.
 */
export function stepsFromPlanFile(
  plan: LoadedPlan,
  classify: (index: number) => PlanStepKind,
): PlanStep[] {
  return plan.steps.map((step): PlanStep => {
    if (step.kind === 'natural') {
      const kind = classify(step.index);
      return {
        index: step.index,
        kind,
        workflowKind: kind,
        anchor: QUOTED.test(step.text) ? 'quoted' : 'free',
        text: step.text,
      };
    }
    if (step.kind === 'fill')
      return {
        index: step.index,
        kind: 'fill',
        workflowKind: 'fill',
        anchor: 'explicit',
        keys: step.keys,
      };
    if (step.kind === 'wait')
      return { index: step.index, kind: 'wait', workflowKind: 'wait', anchor: 'explicit' };
    return {
      index: step.index,
      kind: step.kind,
      workflowKind: step.kind,
      anchor: 'explicit',
      target: step.target,
    };
  });
}

export type Cursor = {
  /** Index of the current step; equal to `steps.length` once every step is complete. */
  index: number;
  /** Input keys consumed while the current step was active. */
  consumedInStep: string[];
};

export const startCursor = (): Cursor => ({ index: 0, consumedInStep: [] });

export type CursorEvent =
  | { type: 'record'; record: ActionRecord }
  /** Jev chose no input key: nothing on this screen belongs to the pending inputs. */
  | { type: 'no_input_key' };

const next = (cursor: Cursor): Cursor => ({ index: cursor.index + 1, consumedInStep: [] });

/** The keys a fill step still has to consume. */
export function pendingKeys(step: PlanStep, allKeys: string[], consumed: Set<string>) {
  return (step.keys ?? allKeys).filter((key) => !consumed.has(key));
}

/**
 * Advances the cursor after an event. `consumed` is the set of keys consumed so far in the run,
 * including the event's record. Returns an error when the event cannot complete the step.
 */
export function advanceCursor(
  steps: PlanStep[],
  cursor: Cursor,
  event: CursorEvent,
  allKeys: string[],
  consumed: Set<string>,
): { cursor: Cursor; error?: string } {
  const step = steps[cursor.index];
  if (!step) return { cursor };
  if (event.type === 'no_input_key') {
    if (step.kind !== 'fill' || step.keys) return { cursor };
    if (cursor.consumedInStep.length === 0)
      return {
        cursor,
        error: `Step ${step.index + 1} ("${step.text ?? 'fill'}") found no field for any pending input`,
      };
    return { cursor: next(cursor) };
  }
  const { record } = event;
  if (record.status !== 'succeeded') return { cursor };
  const action = record.action;
  if (step.kind === 'wait') return { cursor: action.kind === 'wait' ? next(cursor) : cursor };
  if (step.kind === 'click') return { cursor: action.kind === 'click' ? next(cursor) : cursor };
  if (step.kind === 'submit')
    return { cursor: action.kind === 'click' && action.highImpact ? next(cursor) : cursor };
  if (!('inputKey' in action)) return { cursor };
  const updated = { ...cursor, consumedInStep: [...cursor.consumedInStep, action.inputKey] };
  return {
    cursor: pendingKeys(step, allKeys, consumed).length === 0 ? next(updated) : updated,
  };
}

/** Replays a run's records to find the cursor, for callers that only keep the action list. */
export function replayCursor(
  steps: PlanStep[],
  actions: ActionRecord[],
  allKeys: string[],
): Cursor {
  let cursor = startCursor();
  const consumed = new Set<string>();
  for (const record of actions) {
    if (record.status === 'succeeded' && 'inputKey' in record.action)
      consumed.add(record.action.inputKey);
    cursor = advanceCursor(steps, cursor, { type: 'record', record }, allKeys, consumed).cursor;
  }
  return cursor;
}

/** The workflow context Jev receives for the current step. */
export function workflowContext(step: PlanStep | undefined, pending: string[]) {
  if (!step) return undefined;
  if (step.kind === 'fill')
    return {
      kind: step.workflowKind,
      ...(step.text ? { instruction: step.text } : {}),
      inputKeys: pending,
      allowedActions: ['fill', 'select', 'check'],
    };
  return {
    kind: step.workflowKind,
    ...(step.text ? { instruction: step.text } : {}),
    ...(step.target ? { target: step.target } : {}),
    allowedActions: step.kind === 'wait' ? ['wait'] : ['click'],
    ...(step.kind === 'submit'
      ? { finalImpact: true }
      : step.workflowKind === 'click'
        ? { finalImpact: false }
        : {}),
  };
}

export type PlanStepReport = {
  step: number;
  text: string;
  kind: PlanStepKind;
  source: 'classified' | 'explicit';
  status: 'done' | 'pending';
  target?: string;
  keys?: string[];
  note?: string;
};

/**
 * How each plan step was interpreted: its kind, and for steps that were reached, the chosen
 * target or consumed keys. `recordSteps[i]` is the step index that was current for `actions[i]`.
 */
export function planReport(
  steps: PlanStep[],
  actions: ActionRecord[],
  recordSteps: number[],
  cursor: Cursor,
): PlanStepReport[] {
  return steps.map((step) => {
    const records = actions.filter((_, index) => recordSteps[index] === step.index);
    const target = records.map((record) => record.action).find((action) => action.kind === 'click');
    const keys = records.flatMap((record) =>
      'inputKey' in record.action ? [record.action.inputKey] : [],
    );
    return {
      step: step.index + 1,
      text:
        step.text ??
        (step.kind === 'fill'
          ? `fill: [${(step.keys ?? []).join(', ')}]`
          : step.kind === 'wait'
            ? 'wait: load'
            : `${step.kind}: ${step.target}`),
      kind: step.kind,
      source: step.text ? 'classified' : 'explicit',
      status: step.index < cursor.index ? 'done' : 'pending',
      ...(target && 'locator' in target
        ? { target: `${target.locator.strategy}:${target.locator.value}` }
        : {}),
      ...(keys.length ? { keys } : {}),
      ...(step.kind === 'wait'
        ? { note: 'waits for the page load event; any duration in the text is ignored' }
        : {}),
    };
  });
}
