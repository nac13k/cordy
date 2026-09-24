import { PLAN_MAX_STEP_LENGTH, PLAN_MAX_STEPS, type LoadedPlan } from './plan-file.js';

const LINE_MARKER = /^\s*(?:[-*•]|\d+[.)])\s+/;
const QUOTE_CLOSE: Record<string, string> = { '"': '"', '“': '”' };

/** Splits a one-line `1. a 2. b 3. c` enumeration, following the numbers in sequence. */
function splitInlineNumbering(line: string) {
  const first = line.match(/^\s*1([.)])\s+/);
  if (!first) return [line];
  const pieces: string[] = [];
  let rest = line.slice(first[0].length);
  for (let next = 2; ; next += 1) {
    const marker = new RegExp(`\\s${next}[.)]\\s+`).exec(rest);
    if (!marker) break;
    pieces.push(rest.slice(0, marker.index));
    rest = rest.slice(marker.index + marker[0].length);
  }
  if (pieces.length === 0) return [line];
  return [...pieces, rest];
}

/** Splits on commas and semicolons outside double quotes, keeping decimal commas. */
function splitOutsideQuotes(text: string) {
  const pieces: string[] = [];
  let current = '';
  let closing: string | undefined;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (closing) {
      if (char === closing) closing = undefined;
    } else if (char in QUOTE_CLOSE) closing = QUOTE_CLOSE[char];
    else if (
      char === ';' ||
      (char === ',' && !(/\d/.test(text[i - 1] ?? '') && /\d/.test(text[i + 1] ?? '')))
    ) {
      pieces.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  return [...pieces, current];
}

/** Splits a prompt into ordered step texts. A prompt with no separators is one step. */
export function splitPromptSteps(text: string): string[] {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => line.trim());
  const pieces = (lines.length === 1 ? splitInlineNumbering(lines[0]) : lines).map((line) =>
    line.replace(LINE_MARKER, ''),
  );
  return pieces
    .flatMap(splitOutsideQuotes)
    .map((step) => step.trim().replace(/\.+$/, '').trim())
    .filter(Boolean);
}

/** Builds a plan of natural-language steps from a prompt, enforcing the plan file limits. */
export function planFromPrompt(text: string): LoadedPlan {
  const steps = splitPromptSteps(text);
  if (steps.length === 0) throw new Error('invalid prompt: the prompt has no steps');
  if (steps.length > PLAN_MAX_STEPS)
    throw new Error(
      `invalid prompt: at most ${PLAN_MAX_STEPS} steps are allowed (got ${steps.length})`,
    );
  const long = steps.findIndex((step) => step.length > PLAN_MAX_STEP_LENGTH);
  if (long >= 0)
    throw new Error(
      `invalid prompt: prompt step ${long + 1} must be at most ${PLAN_MAX_STEP_LENGTH} characters`,
    );
  return { steps: steps.map((step, index) => ({ index, kind: 'natural', text: step })) };
}
