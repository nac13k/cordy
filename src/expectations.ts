export type InferredExpectations = { visible: string[]; buttons: string[] };

export function inferExpectations(task: string): InferredExpectations {
  const visible: string[] = [];
  const buttons: string[] = [];
  const normalized = task.replace(/\s+/g, ' ').trim();
  const resultData = normalized.match(/resumen\s+del\s+env[ií]o/i);
  if (resultData) visible.push(resultData[0]);
  const button = normalized.match(/bot[oó]n(?:\s+(?:con\s+texto|de))?\s+(.+?)(?=\s+y\s+|\s*,\s*|\.|$)/i);
  if (button?.[1]) buttons.push(button[1].trim().replace(/["“”]/g, ''));
  return { visible: [...new Set(visible)], buttons: [...new Set(buttons)] };
}
